import { Hono } from 'hono'

import { authMode, privateJson } from '../auth'
import { mapOpportunity, mapRun, OPP_SELECT } from '../db'
import type { AppContext } from '../env'
import { seedWorkspace } from '../seed'
import { seedSources } from '../sources-registry'

export const workspace = new Hono<AppContext>()

workspace.get('/me', async (c) => {
  const db = c.get('db')
  const user = c.get('user')
  const owner = user.sub

  const space = await db
    .prepare(`SELECT name, seeded_at FROM workspaces WHERE owner_sub = ?`)
    .bind(owner)
    .first<{ name: string; seeded_at: number | null }>()

  if (!space) {
    await seedWorkspace(db, owner, 'Mitemshub Opportunity Engine')
  } else {
    // Seeding only on first load meant an adapter added later never appeared for an
    // existing workspace. The registry is topped up here instead, but only for the
    // adapters this workspace is missing: `INSERT OR IGNORE` counts as a written row
    // even when it ignores, so re-sending all 18 on every /api/me call burned the
    // daily write allowance without changing a single value.
    const known = await db
      .prepare(`SELECT adapter FROM sources WHERE owner_sub = ?`)
      .bind(owner)
      .all<{ adapter: string }>()
    const present = new Set((known.results ?? []).map((row) => row.adapter))
    const statements = await seedSources(db, owner, present)
    if (statements.length) await db.batch(statements)
  }

  const profiles = await db
    .prepare(`SELECT id, kind, name FROM profiles WHERE owner_sub = ?`)
    .bind(owner)
    .all<{ id: string; kind: 'individual' | 'business'; name: string }>()
  const counts = await db
    .prepare(
      `SELECT p.id, (SELECT COUNT(*) FROM profile_skills s WHERE s.profile_id = p.id AND s.owner_sub = p.owner_sub) AS skills
       FROM profiles p WHERE p.owner_sub = ?`,
    )
    .bind(owner)
    .all<{ id: string; skills: number }>()
  const skillMap = new Map((counts.results ?? []).map((r) => [r.id, Number(r.skills)]))

  const fresh = await db
    .prepare(`SELECT name, seeded_at FROM workspaces WHERE owner_sub = ?`)
    .bind(owner)
    .first<{ name: string; seeded_at: number | null }>()

  return privateJson(c, {
    user: { sub: user.sub, name: user.name, email: user.email, picture: user.picture },
    workspace: { name: fresh?.name ?? 'Opportunity Engine', seededAt: fresh?.seeded_at ?? null },
    profiles: (profiles.results ?? []).map((p) => ({
      id: p.id,
      kind: p.kind,
      name: p.name,
      filled: (skillMap.get(p.id) ?? 0) > 0,
    })),
    capabilities: {
      database: Boolean(c.env.DB),
      files: Boolean(c.env.FILES),
      auth: authMode(c.env, c.req.raw) === 'freebuff' ? 'freebuff' : 'development',
      qualifier: c.env.OPENAI_API_KEY ? 'model' : 'rules',
      ingest: Boolean(c.env.INGEST_SECRET),
    },
  })
})

workspace.get('/overview', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const dayAgo = Date.now() - 86_400_000
  const weekAgo = Date.now() - 7 * 86_400_000

  const one = async (sql: string, ...params: (string | number)[]) => {
    const row = await db.prepare(sql).bind(...params).first<{ n: number | null }>()
    return Number(row?.n ?? 0)
  }

  const [
    newToday,
    newThisWeek,
    highFit,
    awaitingReview,
    emerging,
    activeLeads,
    openTenders,
    sumScore,
  ] = await Promise.all([
    one(`SELECT COUNT(*) AS n FROM opportunities WHERE owner_sub = ? AND first_seen_at > ?`, owner, dayAgo),
    one(`SELECT COUNT(*) AS n FROM opportunities WHERE owner_sub = ? AND first_seen_at > ?`, owner, weekAgo),
    one(`SELECT COUNT(*) AS n FROM opportunities WHERE owner_sub = ? AND score >= 60`, owner),
    one(`SELECT COUNT(*) AS n FROM opportunities WHERE owner_sub = ? AND status IN ('new','reviewing')`, owner),
    one(`SELECT COUNT(*) AS n FROM opportunities WHERE owner_sub = ? AND signal_type = 'emerging'`, owner),
    one(`SELECT COUNT(*) AS n FROM applications WHERE owner_sub = ? AND stage NOT IN ('won','lost')`, owner),
    one(
      `SELECT COUNT(*) AS n FROM opportunities WHERE owner_sub = ? AND pipeline = 'business' AND signal_type = 'explicit' AND status != 'closed'`,
      owner,
    ),
    one(`SELECT AVG(score) AS n FROM opportunities WHERE owner_sub = ? AND score IS NOT NULL`, owner),
  ])

  const feed = await db
    .prepare(`${OPP_SELECT} WHERE o.owner_sub = ? ORDER BY o.first_seen_at DESC LIMIT 24`)
    .bind(owner)
    .all<Record<string, unknown>>()

  const review = await db
    .prepare(
      `${OPP_SELECT} WHERE o.owner_sub = ? AND o.status = 'new' AND o.score IS NOT NULL
       ORDER BY o.score DESC, o.first_seen_at DESC LIMIT 8`,
    )
    .bind(owner)
    .all<Record<string, unknown>>()

  const sources = await db
    .prepare(`SELECT id, label, adapter, health, last_run_at FROM sources WHERE owner_sub = ? ORDER BY label`)
    .bind(owner)
    .all<{ id: string; label: string; adapter: string; health: string; last_run_at: number | null }>()

  const bySource = await db
    .prepare(
      `SELECT o.source_id AS sourceId, COALESCE(s.label, 'Manual / direct') AS label, COUNT(*) AS count
       FROM opportunities o LEFT JOIN sources s ON s.id = o.source_id AND s.owner_sub = o.owner_sub
       WHERE o.owner_sub = ? GROUP BY o.source_id ORDER BY count DESC LIMIT 8`,
    )
    .bind(owner)
    .all<{ sourceId: string | null; label: string; count: number }>()

  const split = await db
    .prepare(
      `SELECT pipeline, COUNT(*) AS count, SUM(CASE WHEN score >= 60 THEN 1 ELSE 0 END) AS highFit
       FROM opportunities WHERE owner_sub = ? GROUP BY pipeline`,
    )
    .bind(owner)
    .all<{ pipeline: 'individual' | 'business'; count: number; highFit: number }>()

  const runs = await db
    .prepare(
      `SELECT r.*, s.label AS source_label FROM source_runs r
       LEFT JOIN sources s ON s.id = r.source_id AND s.owner_sub = r.owner_sub
       WHERE r.owner_sub = ? ORDER BY r.started_at DESC LIMIT 8`,
    )
    .bind(owner)
    .all<Record<string, unknown>>()

  const sourceRows = sources.results ?? []
  const lastScan = runs.results?.[0]?.started_at

  return privateJson(c, {
    health: {
      sources: sourceRows.map((s) => ({
        id: s.id,
        label: s.label,
        adapter: s.adapter,
        health: s.health as 'ok' | 'degraded' | 'failing' | 'unconfigured',
        lastRunAt: s.last_run_at,
      })),
      okCount: sourceRows.filter((s) => s.health === 'ok').length,
      attentionCount: sourceRows.filter((s) => s.health === 'failing' || s.health === 'degraded').length,
      lastScanAt: lastScan ? Number(lastScan) : null,
    },
    kpis: {
      newToday,
      newThisWeek,
      highFit,
      awaitingReview,
      emerging,
      activeLeads,
      openTenders,
      averageScore: Math.round(sumScore || 0),
    },
    feed: (feed.results ?? []).map(mapOpportunity),
    reviewQueue: (review.results ?? []).map(mapOpportunity),
    bySource: (bySource.results ?? []).map((r) => ({ ...r, inserted: Number(r.count) })),
    pipelineSplit: (split.results ?? []).map((r) => ({
      pipeline: r.pipeline,
      count: Number(r.count),
      highFit: Number(r.highFit ?? 0),
    })),
    scanRuns: (runs.results ?? []).map(mapRun),
  })
})

workspace.patch('/workspace', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string }
  const owner = c.get('user').sub
  if (typeof body.name === 'string' && body.name.trim()) {
    await c
      .get('db')
      .prepare(`UPDATE workspaces SET name = ? WHERE owner_sub = ?`)
      .bind(body.name.trim().slice(0, 80), owner)
      .run()
  }
  return privateJson(c, { ok: true })
})

workspace.post('/workspace/reset', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const body = (await c.req.json().catch(() => ({}))) as { mode?: 'clear' | 'restore' }
  await db.batch([
    db.prepare(`DELETE FROM activities WHERE owner_sub = ?`).bind(owner),
    db.prepare(`DELETE FROM scores WHERE owner_sub = ?`).bind(owner),
    db.prepare(`DELETE FROM opportunity_skills WHERE owner_sub = ?`).bind(owner),
    db.prepare(`DELETE FROM applications WHERE owner_sub = ?`).bind(owner),
    db.prepare(`DELETE FROM opportunities WHERE owner_sub = ?`).bind(owner),
    db.prepare(`DELETE FROM source_runs WHERE owner_sub = ?`).bind(owner),
  ])
  if (body.mode === 'restore') {
    await seedWorkspace(db, owner, 'Mitemshub', { keepProfiles: true })
    return privateJson(c, { ok: true, restored: true })
  }
  return privateJson(c, { ok: true, cleared: true })
})
