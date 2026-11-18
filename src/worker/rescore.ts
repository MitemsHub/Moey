import { now } from './db'
import { scoreByRules } from './qualify'
import type { OpportunityForScoring, ProfileForScoring } from './qualify'

// A full pass queues three statements per opportunity, so 400 changed rows is 1200.
// Sending them in bounded chunks keeps one oversized pass from failing wholesale.
const CHUNK = 240

/**
 * Re-scores existing rows for one pipeline with the deterministic rules only.
 *
 * This exists because a score is only as good as the profile it was computed
 * against. When the operator fills a profile, every previously ingested row is
 * suddenly scored against an empty record — a stale 0 that reads like a verdict
 * when it is really a missing input. Re-running the rules keeps the list honest
 * without spending model tokens on a batch refresh.
 *
 * A row is only written when its recomputed result differs from what is already
 * stored, because every profile save used to rewrite all 400 rows three times each
 * — enough written rows in one afternoon to exhaust the daily database allowance and
 * pause the site. The comparison covers both copies of the verdict (the opportunity
 * columns and the per-profile score row), and the rules read the clock, so a row
 * that has genuinely aged into a different freshness band is still refreshed.
 *
 * Returns how many opportunities were actually rewritten.
 */
export async function rescorePipeline(
  db: D1Database,
  ownerSub: string,
  profile: ProfileForScoring & { id: string },
  limit = 400,
): Promise<number> {
  const rows = await db
    .prepare(
      `SELECT o.id, o.title, o.org, o.body, o.scoring_text, o.location, o.remote, o.deadline, o.published_at,
              o.signal_type, o.comp_min, o.comp_max, o.tags_json,
              o.score, o.score_model, o.score_rationale, o.matched_json, o.missing_json, o.confidence,
              s.id AS score_row_id, s.score AS score_row_score, s.model AS score_row_model,
              s.rationale AS score_row_rationale, s.matched_json AS score_row_matched,
              s.missing_json AS score_row_missing
       FROM opportunities o
       -- The newest score row for this profile, so a duplicate left by the old
       -- delete-then-insert bug cannot multiply the result set.
       LEFT JOIN scores s ON s.id = (
         SELECT s2.id FROM scores s2
         WHERE s2.opportunity_id = o.id AND s2.profile_id = ? AND s2.owner_sub = o.owner_sub
         ORDER BY s2.created_at DESC LIMIT 1
       )
       WHERE o.owner_sub = ? AND o.pipeline = ?
       ORDER BY o.first_seen_at DESC LIMIT ?`,
    )
    .bind(profile.id, ownerSub, profile.kind, limit)
    .all<Record<string, unknown>>()

  const statements: D1PreparedStatement[] = []
  const stamp = now()
  let rescored = 0

  const text = (value: unknown) => (value === null || value === undefined ? '' : String(value))
  const numeric = (value: unknown) => (value === null || value === undefined ? null : Number(value))

  for (const row of rows.results ?? []) {
    const scoring: OpportunityForScoring = {
      title: String(row.title),
      org: (row.org as string) ?? null,
      // Same rule as ingest: adapter-written explanation is never read as the
      // posting's own demand language. Rows stored before the column existed fall
      // back to the body, which is correct for every adapter that does not compose.
      body: String(row.scoring_text ?? row.body ?? ''),
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
    const matchedJson = JSON.stringify(result.matched)
    const missingJson = JSON.stringify(result.missing)

    const opportunityStale =
      numeric(row.score) !== result.score ||
      text(row.score_model) !== 'rules' ||
      text(row.score_rationale) !== result.rationale ||
      text(row.matched_json) !== matchedJson ||
      text(row.missing_json) !== missingJson ||
      numeric(row.confidence) !== result.confidence

    const hasScoreRow = row.score_row_id !== null && row.score_row_id !== undefined
    const scoreRowStale =
      !hasScoreRow ||
      numeric(row.score_row_score) !== result.score ||
      text(row.score_row_model) !== 'rules' ||
      text(row.score_row_rationale) !== result.rationale ||
      text(row.score_row_matched) !== matchedJson ||
      text(row.score_row_missing) !== missingJson

    // Nothing changed since the last score: writing it again would spend allowance
    // to store the same values.
    if (!opportunityStale && !scoreRowStale) continue

    rescored += 1

    if (opportunityStale) {
      statements.push(
        db
          .prepare(
            `UPDATE opportunities SET score = ?, score_model = 'rules', score_rationale = ?, matched_json = ?, missing_json = ?, confidence = ?
             WHERE id = ? AND owner_sub = ?`,
          )
          .bind(result.score, result.rationale, matchedJson, missingJson, result.confidence, row.id, ownerSub),
      )
    }

    // One current score per (opportunity, profile). A plain INSERT here doubled
    // every row on each re-score, which is how 92 opportunities ended up with 144
    // score records.
    if (hasScoreRow && scoreRowStale) {
      statements.push(
        db.prepare(`DELETE FROM scores WHERE opportunity_id = ? AND profile_id = ?`).bind(row.id, profile.id),
      )
    }
    if (scoreRowStale) {
      statements.push(
        db
          .prepare(
            `INSERT INTO scores (id, owner_sub, opportunity_id, profile_id, score, matched_json, missing_json, rationale, model, created_at)
             VALUES (?,?,?,?,?,?,?,?, 'rules', ?)`,
          )
          .bind(crypto.randomUUID(), ownerSub, row.id, profile.id, result.score, matchedJson, missingJson, result.rationale, stamp),
      )
    }
  }

  for (let i = 0; i < statements.length; i += CHUNK) {
    await db.batch(statements.slice(i, i + CHUNK))
  }

  return rescored
}
