#!/usr/bin/env node
/**
 * External discovery runner.
 *
 * Freebuff Sites does not expose cron or queue bindings, so the schedule lives in
 * GitHub Actions (.github/workflows/discover.yml). This script is deliberately
 * thin: it asks the Worker which sources are enabled, then asks the Worker to run
 * each one.
 *
 * The adapters live in exactly one place (src/worker/adapters.ts). An earlier
 * version re-implemented all seven here, which meant two copies of every endpoint
 * contract to keep in sync — that duplicate was deleted rather than maintained.
 *
 * Usage:
 *   APP_ORIGIN=https://your-site INGEST_SECRET=… node scripts/discover.mjs
 *   node scripts/discover.mjs --dry     # print the plan, run nothing
 */
const ORIGIN = (process.env.APP_ORIGIN || '').replace(/\/$/, '')
const SECRET = process.env.INGEST_SECRET || ''
const DRY = process.argv.includes('--dry')

if (!DRY && (!ORIGIN || !SECRET)) {
  console.error('APP_ORIGIN and INGEST_SECRET must be set (or pass --dry).')
  process.exit(1)
}

const auth = { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' }

async function call(path, init = {}) {
  const response = await fetch(`${ORIGIN}${path}`, { ...init, headers: auth })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(`${path} → ${response.status} ${payload.error ?? ''}`.trim())
  return payload
}

const { sources } = await call('/api/ingest/plan')
if (!sources.length) {
  console.log('No enabled sources. Configure one in the app before scheduling a scan.')
  process.exit(0)
}

let inserted = 0
let failures = 0
for (const source of sources) {
  if (DRY) {
    console.log(`would run ${source.adapter} (${source.id})`)
    continue
  }
  try {
    const counts = await call('/api/ingest/run', { method: 'POST', body: JSON.stringify({ source: source.id }) })
    inserted += counts.inserted
    console.log(`${source.adapter}: ${counts.found} found, ${counts.inserted} new, ${counts.duplicates} duplicates`)
  } catch (error) {
    failures++
    console.error(`${source.adapter}: ${error.message}`)
  }
}

if (!DRY) console.log(`done: ${inserted} new rows, ${failures} source(s) failed`)
if (failures && failures === sources.length) process.exit(1)
