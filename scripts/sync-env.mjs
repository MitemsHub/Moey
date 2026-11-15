#!/usr/bin/env node
/**
 * Syncs the Worker variables from `.env` into `.dev.vars`.
 *
 * Why both files: `.env` is where a person edits secrets, but the local Worker
 * (via @cloudflare/vite-plugin) reads `.dev.vars`. Rather than make the operator
 * learn that distinction, `predev` copies every key the Worker reads. Both files
 * are git-ignored.
 *
 * A key missing here is invisible to the Worker, which is why every provider listed
 * in src/worker/model.ts must also appear in WORKER_KEYS — otherwise a correctly
 * pasted API key would silently do nothing.
 *
 * Missing values are written as empty strings, which the Worker treats as "not
 * configured" — the model qualifier stays in rules-only mode instead of failing.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'

const WORKER_KEYS = [
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'INGEST_SECRET',
  // Free model providers, resolved in src/worker/model.ts.
  'LLM_PROVIDER',
  'GROQ_API_KEY',
  'GROQ_MODEL',
  'OPENROUTER_API_KEY',
  'OPENROUTER_MODEL',
  'GEMINI_API_KEY',
  'GEMINI_MODEL',
  'GITHUB_TOKEN',
  'GITHUB_MODEL',
  'CEREBRAS_API_KEY',
  'CEREBRAS_MODEL',
  'LLM7_TOKEN',
  'LLM7_MODEL',
  'POLLINATIONS_API_KEY',
  'POLLINATIONS_MODEL',
]

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

// Names only, never values: this line is printed into terminal logs.
const providerKeys = {
  OPENAI_API_KEY: 'freebuff',
  GROQ_API_KEY: 'groq',
  OPENROUTER_API_KEY: 'openrouter',
  GEMINI_API_KEY: 'gemini',
  GITHUB_TOKEN: 'github',
  CEREBRAS_API_KEY: 'cerebras',
  POLLINATIONS_API_KEY: 'pollinations',
  LLM7_TOKEN: 'llm7',
}
const configured = Object.entries(providerKeys)
  .filter(([key]) => fromEnv[key])
  .map(([, id]) => id)
const model = configured.length ? `providers: ${configured.join(', ')}` : 'keyless only (pollinations)'
const runner = fromEnv.INGEST_SECRET ? 'external runner enabled' : 'external runner disabled (no INGEST_SECRET)'
console.log(`[env] synced ${Object.keys(fromEnv).length} value(s) to .dev.vars — ${model}; ${runner}`)
