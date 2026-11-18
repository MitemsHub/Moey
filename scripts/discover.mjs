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

/** 5xx and 429 are the platform answering, not the request being wrong. */
const TRANSIENT = new Set([429, 500, 502, 503, 504])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * A scan run was measured failing with the host's 502 roughly one time in four
 * (2026-11-18), at the same depth that succeeded seconds later, so this retries those
 * answers and dropped connections. It is safe to repeat a run: ingest dedupes on the
 * source's own id, so a run that died after writing some rows only re-reads them.
 * Client errors (401, 404, 400) are reported immediately — retrying cannot fix them.
 */
async function call(path, init = {}, attempts = 3) {
  let lastError = null
  for (let attempt = 1; attempt <= attempts; attempt++) {
    let response = null
    try {
      response = await fetch(`${ORIGIN}${path}`, { ...init, headers: auth })
    } catch (error) {
      lastError = error
    }
    if (response) {
      const payload = await response.json().catch(() => ({}))
      if (response.ok) return payload
      const message = `${path} → ${response.status} ${payload.error ?? ''}`.trim()
      if (!TRANSIENT.has(response.status)) throw new Error(message)
      lastError = new Error(message)
    }
    if (attempt < attempts) {
      const waitMs = attempt * 3000
      console.error(`${lastError?.message ?? 'request failed'} — retrying in ${waitMs / 1000}s`)
      await sleep(waitMs)
    }
  }
  throw lastError ?? new Error(`${path} failed`)
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
