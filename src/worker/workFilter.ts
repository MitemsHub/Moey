/**
 * The work filters, written once so the list route and the scan plan cannot drift
 * apart on what counts as a gig, a job or a bounty.
 *
 * A bounty is its own lane because the transaction is different: a contest judged by
 * the sponsor, with one winner and no rate, rather than an engagement someone offers.
 * It is excluded from both the gig view and the salaried view, and only appears under
 * `all work` or its own filter.
 */

const BOUNTY_SOURCE =
  "EXISTS (SELECT 1 FROM sources s2 WHERE s2.id = o.source_id AND s2.owner_sub = o.owner_sub AND s2.kind = 'bounty')"

const OFFERED_SOURCE =
  "EXISTS (SELECT 1 FROM sources s2 WHERE s2.id = o.source_id AND s2.owner_sub = o.owner_sub AND s2.kind IN ('gig','tender'))"

const SALARIED_SOURCE =
  "EXISTS (SELECT 1 FROM sources s2 WHERE s2.id = o.source_id AND s2.owner_sub = o.owner_sub AND s2.kind IN ('ats','feed'))"

/** SQL for one work filter, or null when the caller asked for everything. */
export function workClause(work: string | undefined): string | null {
  if (work === 'gig') {
    return `(o.work_type = 'gig' OR ${OFFERED_SOURCE}) AND NOT ${BOUNTY_SOURCE}`
  }
  if (work === 'job') {
    return `COALESCE(o.work_type, '') <> 'gig' AND ${SALARIED_SOURCE} AND NOT ${BOUNTY_SOURCE}`
  }
  if (work === 'bounty') {
    return `(o.work_type = 'bounty' OR ${BOUNTY_SOURCE})`
  }
  return null
}

/** Gig and contract rows lead the default list; bounties and salaried jobs follow. */
export const WORK_ORDER =
  "CASE WHEN (o.work_type = 'gig' OR EXISTS (SELECT 1 FROM sources s3 WHERE s3.id = o.source_id AND s3.owner_sub = o.owner_sub AND s3.kind IN ('gig','tender'))) THEN 0 ELSE 1 END, o.first_seen_at DESC"
