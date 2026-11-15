import { Hono } from 'hono'
import type { Context } from 'hono'

import type { RawOpportunity } from '../adapters'
import { getAdapter } from '../adapters'
import { privateJson } from '../auth'
import { id, now, requireDb } from '../db'
import type { AppContext } from '../env'
import { ingest, runSource } from '../ingest'
import type { IngestCounts } from '../ingest'

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
    .prepare(`SELECT id, adapter, pipeline, config_json FROM sources WHERE enabled = 1 ORDER BY adapter`)
    .all<{ id: string; adapter: string; pipeline: string; config_json: string }>()

  return privateJson(c, {
    sources: (rows.results ?? []).map((row) => ({
      id: row.id,
      adapter: row.adapter,
      pipeline: row.pipeline,
      configured: row.config_json !== '{}',
    })),
  })
})

/**
 * Runs one source server-side, with the same adapter the app uses.
 *
 * One source per call on purpose: a large board (Greenhouse with eight employers
 * returns ~2,800 jobs and takes about a minute) would blow a single invocation's
 * budget, and a partial run reported as complete is worse than two calls.
 */
ingestRoute.post('/run', async (c) => {
  const blocked = denied(c)
  if (blocked) return blocked

  const body = (await c.req.json().catch(() => null)) as { source?: string } | null
  if (!body?.source) return privateJson(c, { error: 'Expected { source }.' }, 400)

  const db = c.get('db')
  const row = await db
    .prepare(`SELECT id, owner_sub FROM sources WHERE (id = ? OR adapter = ?) AND enabled = 1`)
    .bind(body.source, body.source)
    .first<{ id: string; owner_sub: string }>()
  if (!row) return privateJson(c, { error: `No enabled source “${body.source}”.` }, 404)

  const counts = await runSource(c.env, db, row.owner_sub, row.id, { timeoutMs: 20_000 })
  return privateJson(c, { source: row.id, ...counts })
})

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
