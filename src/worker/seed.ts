import { id, now } from './db'
import { seedSources } from './sources-registry'

/**
 * Creates the two operating profiles and the source registry for a workspace.
 *
 * Nothing here invents qualifications, clients, employers or statistics. The
 * profile rows are deliberately EMPTY of skills and services: a mitigation of the
 * "never fabricate" rule, not an oversight. `filled` stays false until the
 * operator records real facts in Profiles, and scoring says so.
 *
 * `moey.md` §11.5 also forbids fake opportunity data, so no sample opportunities
 * are inserted. The discovery screen shows a real empty state instead.
 */
export async function seedWorkspace(
  db: D1Database,
  ownerSub: string,
  workspaceName: string,
  options: { keepProfiles?: boolean } = {},
): Promise<void> {
  const stamp = now()
  const statements: D1PreparedStatement[] = []

  const existing = await db
    .prepare(`SELECT seeded_at FROM workspaces WHERE owner_sub = ?`)
    .bind(ownerSub)
    .first<{ seeded_at: number | null }>()

  if (!existing) {
    statements.push(
      db
        .prepare(`INSERT INTO workspaces (owner_sub, name, seeded_at, created_at) VALUES (?,?,?,?)`)
        .bind(ownerSub, options.keepProfiles ? 'Mitemshub Opportunity Engine' : workspaceName, stamp, stamp),
    )
  }

  const profileCount = await db
    .prepare(`SELECT COUNT(*) AS n FROM profiles WHERE owner_sub = ?`)
    .bind(ownerSub)
    .first<{ n: number }>()

  if (Number(profileCount?.n ?? 0) === 0) {
    const individual = id()
    const business = id()
    statements.push(
      db
        .prepare(
          `INSERT INTO profiles (id, owner_sub, kind, name, headline, summary, location, eligibility_json, capacity, is_primary, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          individual, ownerSub, 'individual', 'Individual profile', null, null, null,
          JSON.stringify({}), null, 0, stamp, stamp,
        ),
      db
        .prepare(
          `INSERT INTO profiles (id, owner_sub, kind, name, headline, summary, location, eligibility_json, capacity, is_primary, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          business, ownerSub, 'business', 'Mitemshub', null, null, null,
          JSON.stringify({}), null, 1, stamp, stamp,
        ),
    )
  }

  const sourceStatements = await seedSources(db, ownerSub)
  await db.batch([...statements, ...sourceStatements])
}
