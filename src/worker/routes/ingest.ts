import { Hono } from 'hono'
import type { Context } from 'hono'

import type { RawOpportunity } from '../adapters'
import { getAdapter } from '../adapters'
import { privateJson } from '../auth'
import { id, now, requireDb } from '../db'
import type { AppContext } from '../env'
import { ingest, runSource } from '../ingest'
import type { IngestCounts } from '../ingest'
import { seedSources } from '../sources-registry'
import { workClause } from '../workFilter'

export const ingestRoute = new Hono<AppContext>()

/**
 * The endpoints an external runner (GitHub Actions cron) may call.
 *
 * Freebuff Sites does not expose cron or queue bindings, so scheduling lives in
 * GitHub Actions. These routes are the only writes that are not session-based, so
 * they share one strict gate: a bearer secret that fails closed when unset, a
 * bounded body, and an owner taken from the source row rather than the caller.
 */
ingestRoute.use('*', requireDb)

ingestRoute.post('/', async (c) => {
  const blocked = denied(c)
  if (blocked) return blocked

  const body = (await c.req.json().catch(() => null)) as { source?: string; items?: RawOpportunity[] } | null
  if (!body || typeof body.source !== 'string' || !Array.isArray(body.items)) {
    return privateJson(c, { error: 'Expected { source, items }.' }, 400)
  }
  if (body.items.length > 500) return privateJson(c, { error: 'Batch too large (max 500).' }, 413)

  const db = c.get('db')
  const source = await db
    .prepare(`SELECT id, owner_sub, adapter, pipeline, config_json FROM sources WHERE id = ? OR adapter = ?`)
    .bind(body.source, body.source)
    .first<{ id: string; owner_sub: string; adapter: string; pipeline: string; config_json: string }>()
  if (!source) return privateJson(c, { error: `Unknown source “${body.source}”.` }, 404)
  if (!getAdapter(source.adapter)) return privateJson(c, { error: 'Adapter not registered.' }, 400)

  const owner = source.owner_sub
  const counts: IngestCounts = { found: 0, inserted: 0, duplicates: 0, errors: 0, messages: [] }
  await ingest(c.env, db, owner, source, body.items, counts)

  const stamp = now()
  await db.batch([
    db
      .prepare(
        `INSERT INTO source_runs (id, owner_sub, source_id, started_at, finished_at, found, inserted, duplicates, errors, status, message)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        id(), owner, source.id, stamp, stamp, counts.found, counts.inserted, counts.duplicates, counts.errors,
        counts.errors > 0 ? 'partial' : 'ok', 'Pushed by the external discovery runner.',
      ),
    db
      .prepare(`UPDATE sources SET health = ?, last_run_at = ?, last_error = NULL WHERE id = ? AND owner_sub = ?`)
      .bind(counts.errors > 0 ? 'degraded' : 'ok', stamp, source.id, owner),
  ])

  return privateJson(c, counts)
})

/**
 * What the runner should scan. The source registry is the single source of truth,
 * so the runner never carries its own list of adapters.
 */
ingestRoute.get('/plan', async (c) => {
  const blocked = denied(c)
  if (blocked) return blocked

  const rows = await c.get('db')
    .prepare(
      `SELECT id, adapter, pipeline, config_json FROM sources WHERE enabled = 1
       ORDER BY COALESCE(last_run_at, 0) ASC, adapter`,
    )
    .all<{ id: string; adapter: string; pipeline: string; config_json: string }>()

  // What the rows a scan would write today look like, in the same terms the app's
  // work filter uses. A run that reports "ok, 0 inserted" because every row was a
  // duplicate is otherwise indistinguishable from one that added nothing to the
  // gig view, so the runner gets the totals it is actually trying to move. The
  // clauses come from ../workFilter, so a row cannot count as one thing here and
  // appear under another in the app.
  const totals = await c
    .get('db')
    .prepare(
      `SELECT COUNT(*) AS all_rows,
         SUM(CASE WHEN ${workClause('gig')} THEN 1 ELSE 0 END) AS gig,
         SUM(CASE WHEN ${workClause('job')} THEN 1 ELSE 0 END) AS job,
         SUM(CASE WHEN ${workClause('bounty')} THEN 1 ELSE 0 END) AS bounty
       FROM opportunities o
       LEFT JOIN sources s ON s.id = o.source_id AND s.owner_sub = o.owner_sub`,
    )
    .first<{ all_rows: number; gig: number | null; job: number | null; bounty: number | null }>()

  return privateJson(c, {
    sources: (rows.results ?? []).map((row) => ({
      id: row.id,
      adapter: row.adapter,
      pipeline: row.pipeline,
      configured: row.config_json !== '{}',
    })),
    counts: {
      all: Number(totals?.all_rows ?? 0),
      gig: Number(totals?.gig ?? 0),
      job: Number(totals?.job ?? 0),
      bounty: Number(totals?.bounty ?? 0),
    },
  })
})

/**
 * Runs one source server-side, with the same adapter the app uses.
 *
 * One source per call on purpose: a large board (Greenhouse with eight employers
 * returns ~2,800 jobs and takes about a minute) would blow a single invocation's
 * budget, and a partial run reported as complete is worse than two calls.
 *
 * An optional `max` caps how many new rows this call may write. A cold sweep of a
 * multi-board ATS is the one call that can spend the deployment's whole daily write
 * allowance (Greenhouse returned 786 roles in one measured pass), and the host pauses
 * the site when that happens. The runner passes its remaining budget here; without
 * it the call is unbounded, as before.
 */
ingestRoute.post('/run', async (c) => {
  const blocked = denied(c)
  if (blocked) return blocked

  const body = (await c.req.json().catch(() => null)) as
    | { source?: string; config?: Record<string, unknown>; max?: number }
    | null
  if (!body?.source) return privateJson(c, { error: 'Expected { source }.' }, 400)
  // Optional per-call overrides, merged over the stored config: the runner needs a way
  // to test a depth or a keyword without editing the source row for every attempt.
  const override =
    body.config && typeof body.config === 'object' && !Array.isArray(body.config) ? body.config : undefined
  // Clamped so a mistyped runner argument cannot ask for an unbounded call again.
  const max =
    typeof body.max === 'number' && Number.isFinite(body.max)
      ? Math.min(2000, Math.max(1, Math.floor(body.max)))
      : undefined

  const db = c.get('db')
  let rows = await enabledSources(db, body.source)

  if (!rows.length) {
    // A shipped adapter only entered the registry through a signed-in page load
    // (/api/me), so the external runner could not scan a new source until the owner
    // happened to open the app. Top the registry up for the workspaces that already
    // exist, then look for the source again. This writes only rows that are missing.
    await registerMissingAdapters(db)
    rows = await enabledSources(db, body.source)
  }
  if (!rows.length) return privateJson(c, { error: `No enabled source “${body.source}”.` }, 404)

  // One adapter per call, as before, but a workspace per registry row: the response
  // keeps its original single-object shape unless there is more than one workspace.
  const results: ({ source: string } & IngestCounts)[] = []
  for (const row of rows) {
    const counts = await runSource(c.env, db, row.owner_sub, row.id, {
      timeoutMs: 20_000,
      config: override,
      maxInserts: max,
    })
    results.push({ source: row.id, ...counts })
  }
  return privateJson(c, results.length === 1 ? results[0] : { runs: results })
})

async function enabledSources(db: D1Database, key: string) {
  const rows = await db
    .prepare(`SELECT id, owner_sub FROM sources WHERE (id = ? OR adapter = ?) AND enabled = 1`)
    .bind(key, key)
    .all<{ id: string; owner_sub: string }>()
  return rows.results ?? []
}

/** Adds any registered adapter a workspace is missing, exactly as /api/me does. */
async function registerMissingAdapters(db: D1Database): Promise<void> {
  const owners = await db.prepare(`SELECT DISTINCT owner_sub FROM sources`).all<{ owner_sub: string }>()
  for (const owner of owners.results ?? []) {
    const known = await db
      .prepare(`SELECT adapter FROM sources WHERE owner_sub = ?`)
      .bind(owner.owner_sub)
      .all<{ adapter: string }>()
    const present = new Set((known.results ?? []).map((row) => row.adapter))
    const statements = await seedSources(db, owner.owner_sub, present)
    if (statements.length) await db.batch(statements)
  }
}

/**
 * Operator action on one source: switch it off so the schedule stops scanning it, and
 * optionally remove the rows it already stored. Bearer-gated for the same reason the
 * scans are — the schedule runs outside the app, and taking a source offline should
 * not need a browser session that the owner may not have open.
 */
ingestRoute.post('/source', async (c) => {
  const blocked = denied(c)
  if (blocked) return blocked

  const body = (await c.req.json().catch(() => null)) as
    | { source?: string; enabled?: boolean; purge?: boolean }
    | null
  if (!body?.source) return privateJson(c, { error: 'Expected { source, enabled?, purge? }.' }, 400)
  if (typeof body.enabled !== 'boolean' && body.purge !== true) {
    return privateJson(c, { error: 'Nothing to do: pass enabled or purge.' }, 400)
  }

  const db = c.get('db')
  const rows = await db
    .prepare(`SELECT id, owner_sub FROM sources WHERE id = ? OR adapter = ?`)
    .bind(body.source, body.source)
    .all<{ id: string; owner_sub: string }>()
  const sources = rows.results ?? []
  if (!sources.length) return privateJson(c, { error: `Unknown source “${body.source}”.` }, 404)

  let deleted = 0
  for (const row of sources) {
    if (body.purge) deleted += await purgeSource(db, row.owner_sub, row.id)
    if (typeof body.enabled === 'boolean') {
      await db
        .prepare(`UPDATE sources SET enabled = ? WHERE id = ? AND owner_sub = ?`)
        .bind(body.enabled ? 1 : 0, row.id, row.owner_sub)
        .run()
    }
  }

  return privateJson(c, { sources: sources.map((row) => row.id), deleted })
})

/**
 * Removes one source's opportunities and everything that hangs off them. Child rows
 * are keyed by opportunity id rather than source id, so deleting the opportunity first
 * would leave them orphaned. Chunked to stay inside D1's bound-parameter limit.
 */
async function purgeSource(db: D1Database, ownerSub: string, sourceId: string): Promise<number> {
  const found = await db
    .prepare(`SELECT id FROM opportunities WHERE owner_sub = ? AND source_id = ?`)
    .bind(ownerSub, sourceId)
    .all<{ id: string }>()
  const ids = (found.results ?? []).map((row) => row.id)
  for (let i = 0; i < ids.length; i += 40) {
    const chunk = ids.slice(i, i + 40)
    const marks = chunk.map(() => '?').join(',')
    await db.batch([
      db.prepare(`DELETE FROM opportunity_skills WHERE owner_sub = ? AND opportunity_id IN (${marks})`).bind(ownerSub, ...chunk),
      db.prepare(`DELETE FROM scores WHERE owner_sub = ? AND opportunity_id IN (${marks})`).bind(ownerSub, ...chunk),
      db.prepare(`DELETE FROM activities WHERE owner_sub = ? AND opportunity_id IN (${marks})`).bind(ownerSub, ...chunk),
      db.prepare(`DELETE FROM applications WHERE owner_sub = ? AND opportunity_id IN (${marks})`).bind(ownerSub, ...chunk),
      db.prepare(`DELETE FROM documents WHERE owner_sub = ? AND opportunity_id IN (${marks})`).bind(ownerSub, ...chunk),
      db.prepare(`DELETE FROM opportunities WHERE owner_sub = ? AND id IN (${marks})`).bind(ownerSub, ...chunk),
    ])
  }
  return ids.length
}

/** Returns a response when the caller may not proceed, or null when it may. */
function denied(c: Context<AppContext>): Response | null {
  const secret = c.env.INGEST_SECRET
  if (!secret) {
    return privateJson(
      c,
      { error: 'Ingest is disabled. Set INGEST_SECRET on the deployment before using the external runner.' },
      503,
    )
  }
  const header = c.req.header('authorization') ?? ''
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : ''
  if (!timingSafeEqual(token, secret)) return privateJson(c, { error: 'Unauthorised.' }, 401)
  return null
}

function timingSafeEqual(a: string, b: string): boolean {
  if (!a || a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
