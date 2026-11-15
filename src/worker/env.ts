import type { FreebuffUser } from '@freebuff/auth'

export interface Env {
  ASSETS: Fetcher
  // Attached by Freebuff Sites once provisioned (sites_add_storage). Optional so
  // the app can explain what is missing instead of crashing.
  DB?: D1Database
  FILES?: R2Bucket
  // Injected on deploy once Sign in with Freebuff is enabled (sites_enable_auth).
  FREEBUFF_CLIENT_ID?: string
  FREEBUFF_ISSUER?: string
  APP_ORIGIN?: string
  // Optional model access. Absent means the qualifier is rules-only, and the UI
  // says so rather than implying model judgement.
  OPENAI_API_KEY?: string
  OPENAI_BASE_URL?: string
  OPENAI_MODEL?: string
  // Free providers, in the order model.ts tries them. Any one is enough; the
  // keyless LLM7 tier is the fallback when none is set.
  LLM_PROVIDER?: string
  GROQ_API_KEY?: string
  GROQ_MODEL?: string
  OPENROUTER_API_KEY?: string
  OPENROUTER_MODEL?: string
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  GITHUB_TOKEN?: string
  GITHUB_MODEL?: string
  CEREBRAS_API_KEY?: string
  CEREBRAS_MODEL?: string
  LLM7_TOKEN?: string
  LLM7_MODEL?: string
  POLLINATIONS_API_KEY?: string
  POLLINATIONS_MODEL?: string
  // Bearer token the external discovery runner presents to /api/ingest.
  INGEST_SECRET?: string
}

export type Variables = {
  user: FreebuffUser
  db: D1Database
}

export type AppContext = { Bindings: Env; Variables: Variables }
