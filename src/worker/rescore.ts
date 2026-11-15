import { now } from './db'
import { scoreByRules } from './qualify'
import type { OpportunityForScoring, ProfileForScoring } from './qualify'

/**
 * Re-scores existing rows for one pipeline with the deterministic rules only.
 *
 * This exists because a score is only as good as the profile it was computed
 * against. When the operator fills a profile, every previously ingested row is
 * suddenly scored against an empty record — a stale 0 that reads like a verdict
 * when it is really a missing input. Re-running the rules keeps the list honest
 * without spending model tokens on a batch refresh.
 */
export async function rescorePipeline(
  db: D1Database,
  ownerSub: string,
  profile: ProfileForScoring & { id: string },
  limit = 400,
): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT id, title, org, body, location, remote, deadline, published_at, signal_type, comp_min, comp_max, tags_json
       FROM opportunities WHERE owner_sub = ? AND pipeline = ? ORDER BY first_seen_at DESC LIMIT ?`,
    )
    .bind(ownerSub, profile.kind, limit)
    .all<Record<string, unknown>>()

  const statements: D1PreparedStatement[] = []
  const stamp = now()

  for (const row of rows.results ?? []) {
    const scoring: OpportunityForScoring = {
      title: String(row.title),
      org: (row.org as string) ?? null,
      body: String(row.body ?? ''),
      location: (row.location as string) ?? null,
      remote: row.remote === null ? null : Number(row.remote) === 1,
      deadline: row.deadline === null ? null : Number(row.deadline),
      publishedAt: row.published_at === null ? null : Number(row.published_at),
      pipeline: profile.kind,
      signal: String(row.signal_type) === 'emerging' ? 'emerging' : 'explicit',
      compMin: row.comp_min === null ? null : Number(row.comp_min),
      compMax: row.comp_max === null ? null : Number(row.comp_max),
      tags: (() => {
        try {
          const parsed = JSON.parse(String(row.tags_json ?? '[]'))
          return Array.isArray(parsed) ? parsed.map(String) : []
        } catch {
          return []
        }
      })(),
    }
    const result = scoreByRules(scoring, profile)
    statements.push(
      db
        .prepare(
          `UPDATE opportunities SET score = ?, score_model = 'rules', score_rationale = ?, matched_json = ?, missing_json = ?, confidence = ?
           WHERE id = ? AND owner_sub = ?`,
        )
        .bind(result.score, result.rationale, JSON.stringify(result.matched), JSON.stringify(result.missing), result.confidence, row.id, ownerSub),
      // One current score per (opportunity, profile). A plain INSERT here doubled
      // every row on each re-score, which is how 92 opportunities ended up with 144
      // score records.
      db
        .prepare(`DELETE FROM scores WHERE opportunity_id = ? AND profile_id = ?`)
        .bind(row.id, profile.id),
      db
        .prepare(
          `INSERT INTO scores (id, owner_sub, opportunity_id, profile_id, score, matched_json, missing_json, rationale, model, created_at)
           VALUES (?,?,?,?,?,?,?,?, 'rules', ?)`,
        )
        .bind(
          crypto.randomUUID(), ownerSub, row.id, profile.id, result.score,
          JSON.stringify(result.matched), JSON.stringify(result.missing), result.rationale, stamp,
        ),
    )
  }

  if (statements.length) await db.batch(statements)
  return statements.length / 3
}
