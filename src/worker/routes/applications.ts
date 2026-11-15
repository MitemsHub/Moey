import { Hono } from 'hono'

import { privateJson } from '../auth'
import { APP_SELECT, id, mapApplication, now } from '../db'
import type { AppContext } from '../env'

export const applications = new Hono<AppContext>()

applications.get('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const rows = await db
    .prepare(`${APP_SELECT} WHERE a.owner_sub = ? ORDER BY a.stage, a.position`)
    .bind(owner)
    .all<Record<string, unknown>>()
  return privateJson(c, { items: (rows.results ?? []).map(mapApplication) })
})

applications.patch('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const appId = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as {
    stage?: string
    position?: number
    notes?: string
    nextActionAt?: number | null
  }

  const row = await db
    .prepare(`SELECT opportunity_id FROM applications WHERE id = ? AND owner_sub = ?`)
    .bind(appId, owner)
    .first<{ opportunity_id: string }>()
  if (!row) return privateJson(c, { error: 'Not found.' }, 404)

  const sets: string[] = []
  const bind: (string | number | null)[] = []
  const stages = ['qualifying', 'contacted', 'proposal', 'won', 'lost']
  if (body.stage && stages.includes(body.stage)) { sets.push('stage = ?'); bind.push(body.stage) }
  if (typeof body.position === 'number' && Number.isFinite(body.position)) { sets.push('position = ?'); bind.push(body.position) }
  if (typeof body.notes === 'string') { sets.push('notes = ?'); bind.push(body.notes.slice(0, 4000)) }
  if (body.nextActionAt === null || typeof body.nextActionAt === 'number') {
    sets.push('next_action_at = ?')
    bind.push(body.nextActionAt)
  }
  if (!sets.length) return privateJson(c, { ok: true })

  const stamp = now()
  sets.push('updated_at = ?')
  bind.push(stamp)

  await db.batch([
    db.prepare(`UPDATE applications SET ${sets.join(', ')} WHERE id = ? AND owner_sub = ?`).bind(...bind, appId, owner),
    db
      .prepare(
        `INSERT INTO activities (id, owner_sub, opportunity_id, kind, actor, body, created_at)
         VALUES (?,?,?,'stage','human',?,?)`,
      )
      .bind(id(), owner, row.opportunity_id, body.stage ? `Lead stage set to ${body.stage}.` : 'Lead updated.', stamp),
  ])

  return privateJson(c, { ok: true })
})

applications.post('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const body = (await c.req.json().catch(() => ({}))) as { opportunityId?: string }
  const oppId = body.opportunityId
  if (!oppId) return privateJson(c, { error: 'opportunityId is required.' }, 400)

  const opp = await db
    .prepare(`SELECT id, signal_type FROM opportunities WHERE id = ? AND owner_sub = ?`)
    .bind(oppId, owner)
    .first<{ id: string; signal_type: string }>()
  if (!opp) return privateJson(c, { error: 'Not found.' }, 404)
  if (opp.signal_type === 'emerging') {
    return privateJson(c, { error: 'Emerging signals cannot be added to the pipeline board.' }, 409)
  }

  const stamp = now()
  await db
    .prepare(
      `INSERT OR IGNORE INTO applications (id, owner_sub, opportunity_id, stage, position, next_action_at, notes, created_at, updated_at)
       VALUES (?,?,?,'qualifying',?,NULL,NULL,?,?)`,
    )
    .bind(id(), owner, oppId, stamp, stamp, stamp)
    .run()
  return privateJson(c, { ok: true }, 201)
})
