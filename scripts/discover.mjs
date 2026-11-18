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

/**
 * How many new rows one scan may store in total.
 *
 * Every stored row costs several database writes (the opportunity, its matched
 * skills, its import line), and the host pauses the whole site once the day's write
 * allowance is spent. Four scans a day at 150 rows leaves room for about 600 new
 * rows daily, well inside the allowance at the rate the panel billed on 2026-11-18
 * (1,153 inserts, 13,185 writes). A cold sweep of a multi-board ATS tries to store
 * several thousand rows in one call, which is what caused the pause this fixes.
 *
 * The Worker caps per call and the runner stops between calls, so neither half can
 * overspend on its own. Raise ROW_BUDGET only with the day's write total in view:
 * a scan cannot spend what a later scan already used.
 */
const ROW_BUDGET = Math.max(1, Math.floor(Number(process.env.ROW_BUDGET) || 150))

if (!DRY && (!ORIGIN || !SECRET)) {
  console.error('APP_ORIGIN and INGEST_SECRET must be set (or pass --dry).')
  process.exit(1)
}

const auth = { authorization: `Bearer ${SECRET}`, 'content-type': 'application/json' }

/** 5xx and 429 are the platform answering, not the request being wrong. */
const TRANSIENT = new Set([429, 500, 502, 503, 504])
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * The host pauses the whole site once the day's write allowance is spent. That is
 * not a broken scan and retrying cannot outlast it, so it ends the run as a skip:
 * a failed schedule mails the owner every six hours about something only the clock
 * fixes. A plain 429 (rate limiting) still fails, because that may be our bug.
 */
class HostPaused extends Error {}
const PAUSED = /reached its hosting allowance/i

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
      const body = await response.text()
      let payload = {}
      try {
        payload = JSON.parse(body)
      } catch {
        // A paused host answers in plain text, so keep the raw body for the check below.
      }
      if (response.ok) return payload
      const message = `${path} → ${response.status} ${payload.error ?? ''}`.trim()
      if (response.status === 429 && PAUSED.test(body)) throw new HostPaused(message)
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

/**
 * A skip must look like a skip in the Actions log, not like a silent pass.
 *
 * The script ends by setting an exit code and falling off the end rather than
 * calling process.exit(): exiting while a request is still settling aborted the
 * process with a libuv assertion on Windows (measured, Node 24). Nothing is left
 * to do after a pause anyway, so a clean unwinding finish is both correct and quiet.
 */
let paused = false
function notice(title, error, detail) {
  console.log(`::notice title=${title}::${error.message}`)
  console.log(`${detail} The site is paused until its hosting allowance resets; nothing is broken.`)
  paused = true
}

let sources = []
try {
  sources = (await call('/api/ingest/plan')).sources
} catch (error) {
  if (!(error instanceof HostPaused)) throw error
  notice('Discovery scan skipped', error, 'No source was run.')
}
if (!paused && !sources.length) {
  console.log('No enabled sources. Configure one in the app before scheduling a scan.')
}

let inserted = 0
let failures = 0
let skipped = 0
for (const source of sources) {
  if (DRY) {
    console.log(`would run ${source.adapter} (${source.id})`)
    continue
  }
  const remaining = ROW_BUDGET - inserted
  if (remaining <= 0) {
    skipped = sources.length - sources.indexOf(source)
    break
  }
  try {
    const counts = await call('/api/ingest/run', {
      method: 'POST',
      body: JSON.stringify({ source: source.id, max: remaining }),
    })
    inserted += counts.inserted
    console.log(
      `${source.adapter}: ${counts.found} found, ${counts.inserted} new, ${counts.duplicates} duplicates` +
        (counts.truncated ? ' (stopped at the row budget)' : ''),
    )
    if (counts.truncated) skipped = sources.length - sources.indexOf(source) - 1
  } catch (error) {
    if (error instanceof HostPaused) {
      notice(
        'Discovery scan stopped',
        error,
        `${inserted} new rows were stored before the pause; the remaining sources will run on the next scan.`,
      )
      break
    }
    failures++
    console.error(`${source.adapter}: ${error.message}`)
  }
}

if (!DRY && !paused) {
  console.log(`done: ${inserted} new rows, ${failures} source(s) failed`)
  if (skipped > 0) {
    console.log(
      `row budget of ${ROW_BUDGET} reached; ${skipped} source(s) left for the next scan. ` +
        'Scans start with the least recently run source, so the remainder is not starved.',
    )
  }
}
if (!paused && failures && failures === sources.length) process.exitCode = 1
