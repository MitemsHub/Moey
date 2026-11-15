import { Hono } from 'hono'

import { privateJson } from '../auth'
import { getAdapter } from '../adapters'
import { id, mapRun, mapSource, now } from '../db'
import type { AppContext } from '../env'
import { runSource } from '../ingest'

export const sources = new Hono<AppContext>()

sources.get('/', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const rows = await db
    .prepare(
      `SELECT s.*,
        (SELECT COUNT(*) FROM opportunities o WHERE o.source_id = s.id AND o.owner_sub = s.owner_sub) AS inserted_total,
        (SELECT COALESCE(SUM(r.found), 0) FROM source_runs r WHERE r.source_id = s.id AND r.owner_sub = s.owner_sub) AS found_total
       FROM sources s WHERE s.owner_sub = ? ORDER BY s.label`,
    )
    .bind(owner)
    .all<Record<string, unknown>>()

  const items = (rows.results ?? []).map((row) => {
    const adapter = getAdapter(String(row.adapter))
    return {
      ...mapSource(row),
      attributionLabel: adapter?.attribution.label ?? '',
      attributionUrl: adapter?.attribution.url ?? '',
      configHint: adapter?.configHint ?? '',
      needs: adapter?.needs ?? null,
      config: safeParse(String(row.config_json ?? '{}')),
    }
  })
  return privateJson(c, { items })
})

sources.get('/runs', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const rows = await db
    .prepare(
      `SELECT r.*, s.label AS source_label FROM source_runs r
       LEFT JOIN sources s ON s.id = r.source_id AND s.owner_sub = r.owner_sub
       WHERE r.owner_sub = ? ORDER BY r.started_at DESC LIMIT 40`,
    )
    .bind(owner)
    .all<Record<string, unknown>>()
  return privateJson(c, { items: (rows.results ?? []).map(mapRun) })
})

sources.patch('/:id', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const sourceId = c.req.param('id')
  const body = (await c.req.json().catch(() => ({}))) as {
    enabled?: boolean
    config?: Record<string, unknown>
    label?: string
  }

  const row = await db
    .prepare(`SELECT * FROM sources WHERE id = ? AND owner_sub = ?`)
    .bind(sourceId, owner)
    .first<Record<string, unknown>>()
  if (!row) return privateJson(c, { error: 'Not found.' }, 404)

  const adapter = getAdapter(String(row.adapter))
  const statements: D1PreparedStatement[] = []

  if (typeof body.enabled === 'boolean') {
    statements.push(
      db.prepare(`UPDATE sources SET enabled = ? WHERE id = ? AND owner_sub = ?`).bind(body.enabled ? 1 : 0, sourceId, owner),
    )
  }
  if (body.config && typeof body.config === 'object') {
    // Only keep the shape the adapter documents; unknown keys are dropped so a
    // config cannot smuggle in something the adapter would later trust.
    const cleaned =
      adapter?.key === 'greenhouse' || adapter?.key === 'lever' || adapter?.key === 'ashby'
        ? { boards: toStringList(body.config.boards) }
        : adapter?.key === 'hn'
          ? { queries: toStringList(body.config.queries), sinceDays: Number(body.config.sinceDays ?? 3) }
          : adapter?.key === 'ted'
            ? { query: String(body.config.query ?? ''), limit: Number(body.config.limit ?? 40) }
            : adapter?.key === 'jobicy'
              ? { count: Number(body.config.count ?? 50), industry: String(body.config.industry ?? '') }
              : adapter?.key === 'sam'
                ? { keywords: toStringList(body.config.keywords) }
                : {}
    statements.push(
      db
        .prepare(`UPDATE sources SET config_json = ? WHERE id = ? AND owner_sub = ?`)
        .bind(JSON.stringify(cleaned), sourceId, owner),
    )
  }
  if (typeof body.label === 'string' && body.label.trim()) {
    statements.push(
      db.prepare(`UPDATE sources SET label = ? WHERE id = ? AND owner_sub = ?`).bind(body.label.trim().slice(0, 60), sourceId, owner),
    )
  }
  if (statements.length) await db.batch(statements)
  return privateJson(c, { ok: true })
})

sources.post('/:id/run', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const sourceId = c.req.param('id')

  const row = await db
    .prepare(`SELECT id, adapter, config_json FROM sources WHERE id = ? AND owner_sub = ?`)
    .bind(sourceId, owner)
    .first<{ id: string; adapter: string; config_json: string }>()
  if (!row) return privateJson(c, { error: 'Not found.' }, 404)

  const adapter = getAdapter(row.adapter)
  if (adapter?.needs === 'board-list' && toStringList(safeParse(row.config_json).boards).length === 0) {
    return privateJson(c, { error: 'Add at least one board to this source before running it.' }, 400)
  }

  // Adaptors are plain JSON fetches (I/O, not CPU), so a Worker invocation holds
  // one source comfortably. Bulk scans belong to the external runner.
  // 12s per upstream request. Each ATS board is fetched separately and a slow one
  // is skipped (the adapters catch per board), so this bounds a whole source
  // without losing the boards that answered.
  const counts = await runSource(c.env, db, owner, sourceId, { timeoutMs: 12_000 })
  return privateJson(c, counts)
})

sources.post('/run-all', async (c) => {
  const db = c.get('db')
  const owner = c.get('user').sub
  const rows = await db
    .prepare(`SELECT id, adapter, config_json, enabled FROM sources WHERE owner_sub = ? ORDER BY adapter`)
    .bind(owner)
    .all<{ id: string; adapter: string; config_json: string; enabled: number }>()

  // Every source is reported, including the ones that could not run. A partial
  // run that silently omits four sources reads like a complete one.
  const results: { id: string; inserted: number; duplicates: number; error?: string; skipped?: string }[] = []
  for (const row of rows.results ?? []) {
    if (row.enabled !== 1) {
      results.push({ id: row.id, inserted: 0, duplicates: 0, skipped: 'disabled' })
      continue
    }
    const adapter = getAdapter(row.adapter)
    if (adapter?.needs === 'board-list' && toStringList(safeParse(row.config_json).boards).length === 0) {
      results.push({ id: row.id, inserted: 0, duplicates: 0, skipped: 'no boards configured' })
      continue
    }
    try {
      const counts = await runSource(c.env, db, owner, row.id, { timeoutMs: 8_000 })
      results.push({ id: row.id, inserted: counts.inserted, duplicates: counts.duplicates })
    } catch (error) {
      results.push({ id: row.id, inserted: 0, duplicates: 0, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return privateJson(c, { results, ranAt: now(), runId: id() })
})

function safeParse(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {}
  try {
    return JSON.parse(raw) as Record<string, unknown>
  } catch {
    return {}
  }
}

function toStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((v) => String(v).trim()).filter(Boolean).slice(0, 60)
}
