import { Hono } from 'hono'

import { privateJson } from '../auth'
import { id, now } from '../db'
import type { AppContext } from '../env'
import { rescorePipeline } from '../rescore'

export const profiles = new Hono<AppContext>()

async function withChildren(db: D1Database, owner: string, row: Record<string, unknown>) {
  const profileId = String(row.id)
  const skills = await db
    .prepare(`SELECT skill, level FROM profile_skills WHERE owner_sub = ? AND profile_id = ? ORDER BY level DESC, skill`)
    .bind(owner, profileId)
    .all<{ skill: string; level: number }>()
  const services = await db
    .prepare(`SELECT service, summary, evidence FROM profile_services WHERE owner_sub = ? AND profile_id = ? ORDER BY service`)
    .bind(owner, profileId)
    .all<{ service: string; summary: string | null; evidence: string | null }>()

  let eligibility: Record<string, string> = {}
  try {
    eligibility = JSON.parse(String(row.eligibility_json ?? '{}')) as Record<string, string>
  } catch {
    eligibility = {}
  }

  const skillList = (skills.results ?? []).map((s) => s.skill)
  const serviceList = (services.results ?? []).map((s) => ({
    service: s.service,
    summary: s.summary,
    evidence: s.evidence,
  }))

  return {
    id: profileId,
    kind: row.kind as 'individual' | 'business',
    name: String(row.name),
    headline: (row.headline as string) ?? null,
    summary: (row.summary as string) ?? null,
    location: (row.location as string) ?? null,
    github: (row.github as string) ?? null,
    experience: (row.experience as string) ?? null,
    isPrimary: Number(row.is_primary) === 1,
    skills: skillList,
    services: serviceList,
    eligibility,
    // "Filled" means the scoring input is real. An empty profile cannot produce an
    // honest match score, so the UI must be able to say so.
    filled: skillList.length > 0 || serviceList.length > 0,
  }
}

profiles.get('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const rows = await db
    .prepare(`SELECT * FROM profiles WHERE owner_sub = ? ORDER BY kind`)
    .bind(owner)
    .all<Record<string, unknown>>()
  const items = []
  for (const row of rows.results ?? []) items.push(await withChildren(db, owner, row))
  return privateJson(c, { items })
})

profiles.patch('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const profileId = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string
    headline?: string
    summary?: string
    location?: string
    capacity?: string
    github?: string
    experience?: string
    eligibility?: Record<string, string>
    skills?: string[]
    services?: { service: string; summary?: string; evidence?: string }[]
  }

  const row = await db
    .prepare(`SELECT id FROM profiles WHERE id = ? AND owner_sub = ?`)
    .bind(profileId, owner)
    .first<{ id: string }>()
  if (!row) return privateJson(c, { error: 'Not found.' }, 404)

  const stamp = now()
  const statements: D1PreparedStatement[] = []

  const sets: string[] = []
  const bind: (string | number | null)[] = []
  if (typeof body.name === 'string' && body.name.trim()) { sets.push('name = ?'); bind.push(body.name.trim().slice(0, 120)) }
  if (typeof body.headline === 'string') { sets.push('headline = ?'); bind.push(body.headline.trim().slice(0, 200) || null) }
  if (typeof body.summary === 'string') { sets.push('summary = ?'); bind.push(body.summary.trim().slice(0, 4000) || null) }
  if (typeof body.location === 'string') { sets.push('location = ?'); bind.push(body.location.trim().slice(0, 120) || null) }
  if (typeof body.capacity === 'string') { sets.push('capacity = ?'); bind.push(body.capacity.trim().slice(0, 200) || null) }
  if (typeof body.github === 'string') {
    // Stored exactly as typed, but only when it is a real GitHub login shape.
    const login = body.github.trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\/+$/, '')
    if (login && !/^[a-z\d](?:[a-z\d-]{0,38})$/i.test(login)) {
      return privateJson(c, { error: 'A GitHub username is letters, numbers and hyphens only.' }, 400)
    }
    sets.push('github = ?')
    bind.push(login || null)
  }
  if (typeof body.experience === 'string') { sets.push('experience = ?'); bind.push(body.experience.trim().slice(0, 4000) || null) }
  if (body.eligibility && typeof body.eligibility === 'object') {
    // Only operator-supplied strings are stored. Nothing is inferred, because an
    // inferred eligibility fact would be exactly the fabrication the brief forbids.
    const cleaned: Record<string, string> = {}
    for (const [key, value] of Object.entries(body.eligibility)) {
      if (typeof value === 'string' && value.trim()) cleaned[key.slice(0, 40)] = value.trim().slice(0, 200)
    }
    sets.push('eligibility_json = ?')
    bind.push(JSON.stringify(cleaned))
  }
  if (sets.length) {
    sets.push('updated_at = ?')
    bind.push(stamp)
    statements.push(
      db.prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ? AND owner_sub = ?`).bind(...bind, profileId, owner),
    )
  }

  if (Array.isArray(body.skills)) {
    const skills = body.skills.map((s) => String(s).trim().toLowerCase()).filter(Boolean).slice(0, 60)
    statements.push(db.prepare(`DELETE FROM profile_skills WHERE owner_sub = ? AND profile_id = ?`).bind(owner, profileId))
    for (const skill of [...new Set(skills)]) {
      statements.push(
        db
          .prepare(`INSERT INTO profile_skills (id, owner_sub, profile_id, skill, level) VALUES (?,?,?,?,3)`)
          .bind(id(), owner, profileId, skill.slice(0, 60)),
      )
    }
  }

  if (Array.isArray(body.services)) {
    statements.push(db.prepare(`DELETE FROM profile_services WHERE owner_sub = ? AND profile_id = ?`).bind(owner, profileId))
    for (const entry of body.services.slice(0, 40)) {
      const service = String(entry?.service ?? '').trim()
      if (!service) continue
      statements.push(
        db
          .prepare(`INSERT INTO profile_services (id, owner_sub, profile_id, service, summary, evidence) VALUES (?,?,?,?,?,?)`)
          .bind(
            id(), owner, profileId, service.slice(0, 120),
            entry.summary ? String(entry.summary).slice(0, 600) : null,
            entry.evidence ? String(entry.evidence).slice(0, 600) : null,
          ),
      )
    }
  }

  if (statements.length) await db.batch(statements)

  const updated = await db
    .prepare(`SELECT * FROM profiles WHERE id = ? AND owner_sub = ?`)
    .bind(profileId, owner)
    .first<Record<string, unknown>>()
  if (!updated) return privateJson(c, { ok: true })

  const full = await withChildren(db, owner, updated)

  // Filling a profile changes what every existing row *means*. Re-score the
  // pipeline so a stale 0 does not masquerade as a considered verdict.
  let rescored = 0
  if (Array.isArray(body.skills) || Array.isArray(body.services)) {
    rescored = await rescorePipeline(db, owner, {
      id: profileId,
      kind: full.kind,
      name: full.name,
      headline: full.headline,
      summary: full.summary,
      skills: full.skills,
      services: full.services.map((s) => s.service),
      eligibility: full.eligibility,
    })
  }

  return privateJson(c, { ...full, rescored })
})
