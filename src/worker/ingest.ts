import type { Adapter, RawOpportunity } from './adapters'
import { getAdapter } from './adapters'
import { id, now } from './db'
import { normalise, similarity } from './dedupe'
import type { Env } from './env'
import { MODEL_GATE, refineWithModel, scoreByRules } from './qualify'
import type { OpportunityForScoring, ProfileForScoring, RuleResult } from './qualify'

export interface IngestCounts {
  found: number
  inserted: number
  duplicates: number
  errors: number
  messages: string[]
}

interface SourceRow {
  id: string
  adapter: string
  pipeline: string
  config_json: string
}

async function profilesFor(db: D1Database, ownerSub: string): Promise<ProfileForScoring[]> {
  const rows = await db
    .prepare(`SELECT * FROM profiles WHERE owner_sub = ?`)
    .bind(ownerSub)
    .all<Record<string, unknown>>()
  const out: ProfileForScoring[] = []
  for (const row of rows.results ?? []) {
    const skills = await db
      .prepare(`SELECT skill FROM profile_skills WHERE owner_sub = ? AND profile_id = ?`)
      .bind(ownerSub, row.id)
      .all<{ skill: string }>()
    const services = await db
      .prepare(`SELECT service FROM profile_services WHERE owner_sub = ? AND profile_id = ?`)
      .bind(ownerSub, row.id)
      .all<{ service: string }>()
    out.push({
      kind: row.kind as 'individual' | 'business',
      name: row.name as string,
      headline: (row.headline as string) ?? null,
      summary: (row.summary as string) ?? null,
      skills: (skills.results ?? []).map((s) => s.skill),
      services: (services.results ?? []).map((s) => s.service),
      eligibility: safeJson(row.eligibility_json),
    })
  }
  return out
}

function safeJson(raw: unknown): Record<string, string> {
  if (typeof raw !== 'string' || !raw) return {}
  try {
    return JSON.parse(raw) as Record<string, string>
  } catch {
    return {}
  }
}

/**
 * The single write path for discovered opportunities. Adapters never touch the
 * database, so attribution, dedupe, scoring and the audit trail are identical
 * for every source and for the external runner.
 */
export async function ingest(
  env: Env,
  db: D1Database,
  ownerSub: string,
  source: SourceRow,
  items: RawOpportunity[],
  counts: IngestCounts,
): Promise<void> {
  const adapter = getAdapter(source.adapter)
  const pipeline = (source.pipeline === 'business' ? 'business' : 'individual') as 'individual' | 'business'
  const profiles = await profilesFor(db, ownerSub)
  const profile = profiles.find((p) => p.kind === pipeline) ?? profiles[0]

  const existing = await db
    .prepare(
      `SELECT id, title, org, content_hash, external_id, source_id, work_type, scoring_text
       FROM opportunities WHERE owner_sub = ? AND (source_id = ? OR first_seen_at > ?)`,
    )
    .bind(ownerSub, source.id, Date.now() - 45 * 86_400_000)
    .all<{
      id: string
      title: string
      org: string | null
      content_hash: string
      external_id: string | null
      source_id: string | null
      work_type: string | null
      scoring_text: string | null
    }>()
  const known = existing.results ?? []
  const byExternal = new Map(
    known
      .filter((k): k is typeof k & { external_id: string } => Boolean(k.external_id))
      .map(
        (k) =>
          [k.external_id, { id: k.id, sourceId: k.source_id, workType: k.work_type, scoringText: k.scoring_text }] as const,
      ),
  )
  const byHash = new Set(known.map((k) => k.content_hash))
  const byTitleOrg = known.map((k) => ({ id: k.id, title: k.title, org: k.org ?? '' }))

  const statements: D1PreparedStatement[] = []
  const activities: D1PreparedStatement[] = []
  const stamp = now()

  for (const raw of items) {
    counts.found++
    const n = normalise(raw, {
      pipeline,
      signal: pipeline === 'business' ? 'explicit' : 'explicit',
      adapter: source.adapter,
    })
    if (!n) {
      counts.errors++
      continue
    }

    // Pass 1: exact source identity.
    const already = n.externalId ? byExternal.get(n.externalId) : undefined
    if (already) {
      // A source can start declaring a row's engagement after we stored it (the work
      // type was added later). Re-fetching is how those rows learn it. Only a positive
      // declaration is written, and only onto the source's own rows, so an absent
      // field never strips a fact and nothing is inferred from the posting text.
      if (already.sourceId === source.id && n.work === 'gig' && already.workType !== 'gig') {
        statements.push(
          db
            .prepare(`UPDATE opportunities SET work_type = ? WHERE id = ? AND owner_sub = ? AND source_id = ?`)
            .bind(n.work, already.id, ownerSub, source.id),
        )
      }
      // Same for the column that keeps adapter prose out of scoring: rows stored before
      // it existed only get it back on a scan, otherwise a later re-score would fall
      // back to the body and read our disclaimer as demand again.
      const sourceWords = n.scoringText === n.body ? null : n.scoringText
      if (already.sourceId === source.id && sourceWords !== null && sourceWords !== already.scoringText) {
        statements.push(
          db
            .prepare(`UPDATE opportunities SET scoring_text = ? WHERE id = ? AND owner_sub = ? AND source_id = ?`)
            .bind(sourceWords, already.id, ownerSub, source.id),
        )
      }
      counts.duplicates++
      continue
    }
    // Pass 2: exact content identity (same role from two boards).
    if (byHash.has(n.contentHash)) {
      counts.duplicates++
      continue
    }
    // Pass 3: fuzzy title+org. Catches re-posts with a changed id.
    const near = byTitleOrg.find((k) => similarity(k.title, n.title) >= 0.86 && (k.org ?? '') === (n.org ?? ''))
    if (near) {
      counts.duplicates++
      continue
    }

    const oppId = id()
    const scoring: OpportunityForScoring = {
      title: n.title,
      org: n.org,
      // Only what the source published: an adapter's own note is stored for the reader
      // and never counted as the posting's demand language.
      body: n.scoringText,
      location: n.location,
      remote: n.remote,
      deadline: n.deadline,
      publishedAt: n.publishedAt,
      pipeline,
      signal: n.signal,
      compMin: n.compMin,
      compMax: n.compMax,
      tags: n.tags ?? [],
    }

    let result: RuleResult = { score: 0, matched: [], missing: [], rationale: 'not scored', model: 'rules', confidence: 0.4 }
    if (profile) {
      result = scoreByRules(scoring, profile)
      if (result.score >= MODEL_GATE) {
        result = await refineWithModel(env, scoring, profile, result)
      }
    }

    const detected = result.matched.length ? result.matched : []
    statements.push(
      db
        .prepare(
          `INSERT INTO opportunities
            (id, owner_sub, pipeline, signal_type, title, org, url, source_id, external_id, location, remote,
             body, published_at, deadline, comp_min, comp_max, comp_currency, status, content_hash, confidence,
             score, score_model, score_rationale, matched_json, missing_json, first_seen_at, last_seen_at, tags_json,
             work_type, scoring_text)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'new',?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          oppId, ownerSub, pipeline, n.signal, n.title, n.org, n.url, source.id, n.externalId, n.location,
          n.remote === null ? null : n.remote ? 1 : 0, n.body, n.publishedAt, n.deadline, n.compMin, n.compMax,
          n.compCurrency, n.contentHash, result.confidence, result.score, result.model, result.rationale,
          JSON.stringify(result.matched), JSON.stringify(result.missing), stamp, stamp,
          JSON.stringify(n.tags ?? []), n.work, n.scoringText === n.body ? null : n.scoringText,
        ),
    )
    for (const skill of detected.slice(0, 12)) {
      statements.push(
        db
          .prepare(`INSERT INTO opportunity_skills (id, owner_sub, opportunity_id, skill) VALUES (?,?,?,?)`)
          .bind(id(), ownerSub, oppId, skill),
      )
    }
    activities.push(
      db
        .prepare(
          `INSERT INTO activities (id, owner_sub, opportunity_id, kind, actor, body, created_at)
           VALUES (?,?,?,'ingested','source',?,?)`,
        )
        .bind(
          id(),
          ownerSub,
          oppId,
          `Imported from ${adapter?.label ?? source.adapter}. Source URL kept. Scored ${result.score}/100 by ${result.model} at ingest — re-scoring updates the current score, this line records what happened at import.`,
          stamp,
        ),
    )

    byExternal.set(n.externalId, {
      id: oppId,
      sourceId: source.id,
      workType: n.work,
      scoringText: n.scoringText === n.body ? null : n.scoringText,
    })
    byHash.add(n.contentHash)
    byTitleOrg.push({ id: oppId, title: n.title, org: n.org ?? '' })
    counts.inserted++
  }

  if (statements.length) await db.batch(statements)
  if (activities.length) await db.batch(activities)
}

/** Runs one adapter end to end, recording a source_runs row around it. */
export async function runSource(
  env: Env,
  db: D1Database,
  ownerSub: string,
  sourceId: string,
  extra: { config?: Record<string, unknown>; timeoutMs?: number } = {},
): Promise<IngestCounts> {
  const runId = id()
  const startedAt = now()
  const source = await db
    .prepare(`SELECT * FROM sources WHERE id = ? AND owner_sub = ?`)
    .bind(sourceId, ownerSub)
    .first<SourceRow & { enabled: number; adapter: string }>()
  if (!source) throw new Error('Source not found.')
  const adapter: Adapter | undefined = getAdapter(source.adapter)
  if (!adapter) throw new Error(`No adapter registered for “${source.adapter}”.`)

  await db
    .prepare(
      `INSERT INTO source_runs (id, owner_sub, source_id, started_at, status, message) VALUES (?,?,?,?, 'running', NULL)`,
    )
    .bind(runId, ownerSub, sourceId, startedAt)
    .run()

  const counts: IngestCounts = { found: 0, inserted: 0, duplicates: 0, errors: 0, messages: [] }
  let status: 'ok' | 'partial' | 'failed' = 'ok'

  try {
    const config = { ...safeJson(source.config_json), ...(extra.config ?? {}) }
    const items = await adapter.fetch({
      config,
      pipeline: source.pipeline === 'business' ? 'business' : 'individual',
      signal: adapter.kind === 'community' ? 'emerging' : 'explicit',
      timeoutMs: extra.timeoutMs ?? 12_000,
    })
    await ingest(env, db, ownerSub, source, items, counts)
    if (counts.errors > 0) status = 'partial'
  } catch (error) {
    status = 'failed'
    const message = error instanceof Error ? error.message : String(error)
    counts.messages.push(message)
    await db
      .prepare(`UPDATE sources SET health = 'failing', last_error = ?, last_run_at = ? WHERE id = ? AND owner_sub = ?`)
      .bind(message.slice(0, 500), startedAt, sourceId, ownerSub)
      .run()
  }

  await db.batch([
    db
      .prepare(
        `UPDATE source_runs SET finished_at = ?, found = ?, inserted = ?, duplicates = ?, errors = ?, status = ?, message = ?
         WHERE id = ? AND owner_sub = ?`,
      )
      .bind(now(), counts.found, counts.inserted, counts.duplicates, counts.errors, status, counts.messages[0]?.slice(0, 500) ?? null, runId, ownerSub),
    ...(status === 'failed'
      ? []
      : [
          db
            .prepare(
              `UPDATE sources SET health = ?, last_run_at = ?, last_error = NULL WHERE id = ? AND owner_sub = ?`,
            )
            .bind(status === 'partial' ? 'degraded' : 'ok', now(), sourceId, ownerSub),
        ]),
  ])

  return counts
}
