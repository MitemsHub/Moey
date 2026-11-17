import { Hono } from 'hono'

import { privateJson } from '../auth'
import { id, mapActivity, mapApplication, mapOpportunity, now, OPP_SELECT } from '../db'
import type { AppContext } from '../env'
import { extractSkills, MODEL_GATE, refineWithModel, scoreByRules } from '../qualify'
import type { OpportunityForScoring, ProfileForScoring } from '../qualify'

export const opportunities = new Hono<AppContext>()

interface ListQuery {
  q?: string
  pipeline?: string
  signal?: string
  status?: string
  source?: string
  remote?: string
  location?: string
  minScore?: string
  sort?: string
  page?: string
}

opportunities.get('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const url = new URL(c.req.url)
  const query = Object.fromEntries(url.searchParams) as ListQuery

  const where: string[] = ['o.owner_sub = ?']
  const bind: (string | number)[] = [owner]

  if (query.q) {
    where.push('(o.title LIKE ? OR o.org LIKE ? OR o.body LIKE ?)')
    const like = `%${query.q.replace(/[%_]/g, '')}%`
    bind.push(like, like, like)
  }
  if (query.pipeline === 'individual' || query.pipeline === 'business') {
    where.push('o.pipeline = ?')
    bind.push(query.pipeline)
  }
  if (query.signal === 'explicit' || query.signal === 'emerging') {
    where.push('o.signal_type = ?')
    bind.push(query.signal)
  }
  if (query.status && /^(new|reviewing|shortlisted|in_progress|closed|rejected)$/.test(query.status)) {
    where.push('o.status = ?')
    bind.push(query.status)
  }
  if (query.source) {
    where.push('o.source_id = ?')
    bind.push(query.source)
  }
  // "Remote" has to cover two truths: the flag the adapters set from the posting,
  // and a location that literally reads Remote / Anywhere — manual entries and some
  // feeds record only the second. Neither is inferred beyond what the row says.
  if (query.remote === 'only') {
    where.push("(o.remote = 1 OR o.location LIKE '%remote%')")
  }
  if (query.location) {
    where.push('o.location LIKE ?')
    bind.push(`%${query.location.replace(/[%_]/g, '')}%`)
  }
  if (query.minScore && !Number.isNaN(Number(query.minScore))) {
    where.push('o.score >= ?')
    bind.push(Number(query.minScore))
  }

  const order =
    query.sort === 'score'
      ? 'o.score DESC NULLS LAST, o.first_seen_at DESC'
      : query.sort === 'deadline'
        ? 'o.deadline ASC NULLS LAST, o.first_seen_at DESC'
        : 'o.first_seen_at DESC'

  const page = Math.max(1, Number(query.page ?? 1) || 1)
  const pageSize = 25
  const clause = where.join(' AND ')

  const total = await db
    .prepare(`SELECT COUNT(*) AS n FROM opportunities o WHERE ${clause}`)
    .bind(...bind)
    .first<{ n: number }>()

  const rows = await db
    .prepare(`${OPP_SELECT} WHERE ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`)
    .bind(...bind, pageSize, (page - 1) * pageSize)
    .all<Record<string, unknown>>()

  return privateJson(c, {
    items: (rows.results ?? []).map(mapOpportunity),
    total: Number(total?.n ?? 0),
    page,
    pageSize,
  })
})

opportunities.get('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const row = await db
    .prepare(`${OPP_SELECT} WHERE o.id = ? AND o.owner_sub = ?`)
    .bind(c.req.param('id'), owner)
    .first<Record<string, unknown>>()
  if (!row) return privateJson(c, { error: 'Not found.' }, 404)

  const base = mapOpportunity(row)
  const acts = await db
    .prepare(`SELECT * FROM activities WHERE owner_sub = ? AND opportunity_id = ? ORDER BY created_at DESC LIMIT 40`)
    .bind(owner, base.id)
    .all<Record<string, unknown>>()
  const appRow = await db
    .prepare(`SELECT * FROM applications WHERE owner_sub = ? AND opportunity_id = ?`)
    .bind(owner, base.id)
    .first<Record<string, unknown>>()

  const priority = base.score ?? 0
  const source = await db
    .prepare(`SELECT label, adapter FROM sources WHERE id = ? AND owner_sub = ?`)
    .bind(base.sourceId, owner)
    .first<{ label: string; adapter: string }>()

  // Provenance is assembled from stored facts only. A step we cannot evidence is
  // marked missing rather than assumed, which is the whole point of the rail.
  const provenance = [
    {
      key: 'source' as const,
      label: 'Source',
      detail: source ? `${source.label} (${source.adapter})` : 'Manually submitted',
      at: base.firstSeenAt,
      state: 'done' as const,
    },
    {
      key: 'fetched' as const,
      label: 'Fetched',
      detail: base.publishedAt ? `Published ${new Date(base.publishedAt).toISOString().slice(0, 10)}` : 'Publication date not published by the source',
      at: base.publishedAt,
      state: base.publishedAt ? ('done' as const) : ('pending' as const),
    },
    {
      key: 'normalised' as const,
      label: 'Normalised',
      detail: `Identity hash ${String(row.content_hash ?? '').slice(0, 8)} · external id ${String(row.external_id ?? '—')}`,
      at: base.firstSeenAt,
      state: 'done' as const,
    },
    {
      key: 'qualified' as const,
      label: 'Qualified',
      detail: base.scoreModel === 'model' ? `Model score ${priority}/100` : `Rule score ${priority}/100`,
      at: base.firstSeenAt,
      state: base.score === null ? ('missing' as const) : ('done' as const),
    },
    {
      key: 'decision' as const,
      label: 'Decision',
      detail: `${base.status.replace('_', ' ')}${appRow ? ` · ${String(appRow.stage)}` : ''}`,
      at: appRow ? Number(appRow.updated_at) : null,
      state: base.status === 'new' ? ('pending' as const) : ('done' as const),
    },
  ]

  return privateJson(c, {
    ...base,
    body: String(row.body ?? ''),
    matched: base.skills,
    missing: JSON.parse(String(row.missing_json ?? '[]')) as string[],
    provenance,
    activities: (acts.results ?? []).map(mapActivity),
    application: appRow ? mapApplication(appRow) : null,
  })
})

opportunities.post('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const body = (await c.req.json().catch(() => ({}))) as {
    title?: string
    org?: string
    url?: string
    pipeline?: string
    signal?: string
    body?: string
    location?: string
    deadline?: string | number
    compMin?: number
    compMax?: number
  }

  const title = (body.title ?? '').trim()
  const url = (body.url ?? '').trim()
  if (!title) return privateJson(c, { error: 'A title is required.' }, 400)
  if (url && !/^https?:\/\//i.test(url)) return privateJson(c, { error: 'The link must start with http:// or https://.' }, 400)

  const pipeline = body.pipeline === 'business' ? 'business' : 'individual'
  const signal = body.signal === 'emerging' ? 'emerging' : 'explicit'
  const stamp = now()
  const oppId = id()
  const text = (body.body ?? '').slice(0, 20_000)
  const deadline =
    body.deadline === undefined || body.deadline === '' || body.deadline === null
      ? null
      : new Date(body.deadline).getTime() || null

  const profile = await loadProfile(db, owner, pipeline)
  const scoring: OpportunityForScoring = {
    title,
    org: body.org ?? null,
    body: text,
    location: body.location ?? null,
    remote: null,
    deadline,
    publishedAt: stamp,
    pipeline,
    signal,
    compMin: body.compMin ?? null,
    compMax: body.compMax ?? null,
  }
  const result = profile ? scoreByRules(scoring, profile) : null

  await db.batch([
    db
      .prepare(
        `INSERT INTO opportunities
          (id, owner_sub, pipeline, signal_type, title, org, url, source_id, external_id, location, remote, body,
           published_at, deadline, comp_min, comp_max, comp_currency, status, content_hash, confidence,
           score, score_model, score_rationale, matched_json, missing_json, first_seen_at, last_seen_at)
         VALUES (?,?,?,?,?,?,?,NULL,NULL,?,NULL,?,?,?,?,?,NULL,'new',?,?,?,?,?,?,?,?,?)`,
      )
      .bind(
        oppId, owner, pipeline, signal, title, body.org ?? null, url || windowlessPlaceholder(title),
        body.location ?? null, text, stamp, deadline, body.compMin ?? null, body.compMax ?? null,
        `manual-${oppId.slice(0, 8)}`, result?.confidence ?? 0.5, result?.score ?? null,
        result?.model ?? null, result?.rationale ?? null, JSON.stringify(result?.matched ?? []),
        JSON.stringify(result?.missing ?? []), stamp, stamp,
      ),
    db
      .prepare(
        `INSERT INTO activities (id, owner_sub, opportunity_id, kind, actor, body, created_at)
         VALUES (?,?,?,'submitted','human',?,?)`,
      )
      .bind(id(), owner, oppId, 'Submitted manually by the operator. No third-party attribution applies.', stamp),
  ])

  const skills = extractSkills(`${title} ${text}`)
  if (skills.length) {
    await db.batch(
      skills.slice(0, 12).map((skill) =>
        db
          .prepare(`INSERT INTO opportunity_skills (id, owner_sub, opportunity_id, skill) VALUES (?,?,?,?)`)
          .bind(id(), owner, oppId, skill),
      ),
    )
  }

  return privateJson(c, { id: oppId }, 201)
})

function windowlessPlaceholder(title: string): string {
  // A manual entry with no link is still traceable: it points at the record.
  return `urn:opportunity:${encodeURIComponent(title.slice(0, 60))}`
}

opportunities.patch('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const oppId = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as { status?: string; signalType?: string }
  const next = body.status
  const allowed = ['new', 'reviewing', 'shortlisted', 'in_progress', 'closed', 'rejected']
  if (!next || !allowed.includes(next)) return privateJson(c, { error: 'Unknown status.' }, 400)

  const existing = await db
    .prepare(`SELECT status FROM opportunities WHERE id = ? AND owner_sub = ?`)
    .bind(oppId, owner)
    .first<{ status: string }>()
  if (!existing) return privateJson(c, { error: 'Not found.' }, 404)

  const stamp = now()
  await db.batch([
    db.prepare(`UPDATE opportunities SET status = ? WHERE id = ? AND owner_sub = ?`).bind(next, oppId, owner),
    db
      .prepare(
        `INSERT INTO activities (id, owner_sub, opportunity_id, kind, actor, body, created_at)
         VALUES (?,?,?,'status','human',?,?)`,
      )
      .bind(id(), owner, oppId, `Status ${existing.status.replace('_', ' ')} → ${next.replace('_', ' ')}.`, stamp),
  ])
  return privateJson(c, { ok: true, status: next })
})

opportunities.post('/:id/score', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const oppId = c.req.param('id')
  const row = await db
    .prepare(`SELECT * FROM opportunities WHERE id = ? AND owner_sub = ?`)
    .bind(oppId, owner)
    .first<Record<string, unknown>>()
  if (!row) return privateJson(c, { error: 'Not found.' }, 404)

  const pipeline = String(row.pipeline) === 'business' ? 'business' : 'individual'
  const profile = await loadProfile(db, owner, pipeline)
  if (!profile) return privateJson(c, { error: 'No profile exists for this pipeline yet.' }, 400)

  const scoring: OpportunityForScoring = {
    title: String(row.title),
    org: (row.org as string) ?? null,
    body: String(row.body ?? ''),
    location: (row.location as string) ?? null,
    remote: row.remote === null ? null : Number(row.remote) === 1,
    deadline: row.deadline === null ? null : Number(row.deadline),
    publishedAt: row.published_at === null ? null : Number(row.published_at),
    pipeline,
    signal: String(row.signal_type) === 'emerging' ? 'emerging' : 'explicit',
    compMin: row.comp_min === null ? null : Number(row.comp_min),
    compMax: row.comp_max === null ? null : Number(row.comp_max),
  }

  let result = scoreByRules(scoring, profile)
  if (result.score >= MODEL_GATE) result = await refineWithModel(c.env, scoring, profile, result)

  const stamp = now()
  await db.batch([
    db
      .prepare(
        `UPDATE opportunities SET score = ?, score_model = ?, score_rationale = ?, matched_json = ?, missing_json = ?, confidence = ?
         WHERE id = ? AND owner_sub = ?`,
      )
      .bind(result.score, result.model, result.rationale, JSON.stringify(result.matched), JSON.stringify(result.missing), result.confidence, oppId, owner),
    db
      .prepare(
        `INSERT INTO scores (id, owner_sub, opportunity_id, profile_id, score, matched_json, missing_json, rationale, model, created_at)
         VALUES (?,?,?,?,?,?,?,?,?,?)`,
      )
      .bind(id(), owner, oppId, profile.id ?? 'unknown', result.score, JSON.stringify(result.matched), JSON.stringify(result.missing), result.rationale, result.model, stamp),
    db
      .prepare(
        `INSERT INTO activities (id, owner_sub, opportunity_id, kind, actor, body, created_at)
         VALUES (?,?,?,'scored','agent',?,?)`,
      )
      .bind(id(), owner, oppId, `Re-scored ${result.score}/100 by ${result.model}: ${result.rationale}`, stamp),
  ])

  return privateJson(c, result)
})

opportunities.post('/:id/apply', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const oppId = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as { stage?: string }

  const opp = await db
    .prepare(`SELECT id, pipeline, signal_type, status FROM opportunities WHERE id = ? AND owner_sub = ?`)
    .bind(oppId, owner)
    .first<{ id: string; pipeline: string; signal_type: string; status: string }>()
  if (!opp) return privateJson(c, { error: 'Not found.' }, 404)

  // Guardrail from the brief: an emerging signal is an unverified discussion, not
  // a lead. It may be researched, never advanced into a committed board.
  if (opp.signal_type === 'emerging') {
    return privateJson(
      c,
      { error: 'This is an emerging signal, not a verified opportunity. Confirm it against a real source before adding it to a board.' },
      409,
    )
  }

  const stamp = now()
  await db.batch([
    db
      .prepare(
        `INSERT OR IGNORE INTO applications (id, owner_sub, opportunity_id, stage, position, next_action_at, notes, created_at, updated_at)
         VALUES (?,?,?,?,?,NULL,NULL,?,?)`,
      )
      .bind(id(), owner, oppId, (body.stage as string) ?? 'qualifying', stamp, stamp, stamp),
    db
      .prepare(`UPDATE opportunities SET status = 'in_progress' WHERE id = ? AND owner_sub = ? AND status IN ('new','reviewing','shortlisted')`)
      .bind(oppId, owner),
    db
      .prepare(
        `INSERT INTO activities (id, owner_sub, opportunity_id, kind, actor, body, created_at)
         VALUES (?,?,?,'tracked','human',?,?)`,
      )
      .bind(id(), owner, oppId, 'Added to the pipeline board for review. No application has been sent.', stamp),
  ])
  return privateJson(c, { ok: true })
})

async function loadProfile(db: D1Database, owner: string, kind: 'individual' | 'business'): Promise<(ProfileForScoring & { id: string }) | null> {
  const row = await db
    .prepare(`SELECT * FROM profiles WHERE owner_sub = ? AND kind = ?`)
    .bind(owner, kind)
    .first<Record<string, unknown>>()
  if (!row) return null
  const skills = await db
    .prepare(`SELECT skill FROM profile_skills WHERE owner_sub = ? AND profile_id = ?`)
    .bind(owner, row.id)
    .all<{ skill: string }>()
  const services = await db
    .prepare(`SELECT service FROM profile_services WHERE owner_sub = ? AND profile_id = ?`)
    .bind(owner, row.id)
    .all<{ service: string }>()
  let eligibility: Record<string, string> = {}
  try {
    eligibility = JSON.parse(String(row.eligibility_json ?? '{}')) as Record<string, string>
  } catch {
    eligibility = {}
  }
  return {
    id: String(row.id),
    kind,
    name: String(row.name),
    headline: (row.headline as string) ?? null,
    summary: (row.summary as string) ?? null,
    skills: (skills.results ?? []).map((s) => s.skill),
    services: (services.results ?? []).map((s) => s.service),
    eligibility,
  }
}
