#!/usr/bin/env node
/**
 * Syncs the handful of Worker variables from `.env` into `.dev.vars`.
 *
 * Why both files: `.env` is where a person edits secrets, but the local Worker
 * (via @cloudflare/vite-plugin) reads `.dev.vars`. Rather than make the operator
 * learn that distinction, `predev` copies the four keys it needs. Both files are
 * git-ignored.
 *
 * Missing values are written as empty strings, which the Worker treats as "not
 * configured" — the model qualifier stays in rules-only mode instead of failing.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const WORKER_KEYS = ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'OPENAI_MODEL', 'INGEST_SECRET']

if (!existsSync('.env')) {
  console.log('[env] no .env — copy .env.example to .env to configure the model qualifier')
  process.exit(0)
}

const fromEnv = {}
for (const line of readFileSync('.env', 'utf8').split(/\r?\n/)) {
  const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line)
  if (!match) continue
  const value = match[2].trim().replace(/^['"]|['"]$/g, '')
  if (value) fromEnv[match[1]] = value
}

const lines = ['# Generated from .env by scripts/sync-env.mjs — do not edit by hand.']
for (const key of WORKER_KEYS) lines.push(`${key}=${fromEnv[key] ?? ''}`)
writeFileSync('.dev.vars', `${lines.join('\n')}\n`)

const model = fromEnv.OPENAI_API_KEY ? 'model qualifier ENABLED' : 'rules-only'
const runner = fromEnv.INGEST_SECRET ? 'external runner enabled' : 'external runner disabled (no INGEST_SECRET)'
console.log(`[env] synced ${Object.keys(fromEnv).length} value(s) to .dev.vars — ${model}; ${runner}`)
