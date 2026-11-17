import type { MiddlewareHandler } from 'hono'

import type { AppContext } from './env'

// D1 has no migration runner on Freebuff Sites, so the schema is created on the
// first request of each isolate with a single batch of IF NOT EXISTS statements.
// Add new statements at the end; never edit an existing one in place once it has
// been deployed, or older databases will silently drift.
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS workspaces (
    owner_sub TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    seeded_at INTEGER,
    created_at INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS profiles (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    kind TEXT NOT NULL,
    name TEXT NOT NULL,
    headline TEXT,
    summary TEXT,
    location TEXT,
    eligibility_json TEXT NOT NULL DEFAULT '{}',
    capacity TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS profiles_owner_kind ON profiles(owner_sub, kind)`,
  `CREATE TABLE IF NOT EXISTS profile_skills (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    skill TEXT NOT NULL,
    level INTEGER NOT NULL DEFAULT 3
  )`,
  `CREATE INDEX IF NOT EXISTS profile_skills_profile ON profile_skills(owner_sub, profile_id)`,
  `CREATE TABLE IF NOT EXISTS profile_services (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    service TEXT NOT NULL,
    summary TEXT,
    evidence TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS profile_services_profile ON profile_services(owner_sub, profile_id)`,

  `CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    adapter TEXT NOT NULL,
    label TEXT NOT NULL,
    kind TEXT NOT NULL,
    pipeline TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    config_json TEXT NOT NULL DEFAULT '{}',
    health TEXT NOT NULL DEFAULT 'unconfigured',
    last_run_at INTEGER,
    last_error TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS sources_owner_adapter ON sources(owner_sub, adapter)`,
  `CREATE TABLE IF NOT EXISTS source_runs (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    source_id TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    found INTEGER NOT NULL DEFAULT 0,
    inserted INTEGER NOT NULL DEFAULT 0,
    duplicates INTEGER NOT NULL DEFAULT 0,
    errors INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    message TEXT
  )`,
  `CREATE INDEX IF NOT EXISTS source_runs_owner ON source_runs(owner_sub, started_at DESC)`,
  `CREATE INDEX IF NOT EXISTS source_runs_source ON source_runs(owner_sub, source_id, started_at DESC)`,

  `CREATE TABLE IF NOT EXISTS opportunities (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    pipeline TEXT NOT NULL,
    signal_type TEXT NOT NULL DEFAULT 'explicit',
    title TEXT NOT NULL,
    org TEXT,
    url TEXT NOT NULL,
    source_id TEXT,
    external_id TEXT,
    location TEXT,
    remote INTEGER,
    body TEXT NOT NULL DEFAULT '',
    published_at INTEGER,
    deadline INTEGER,
    comp_min INTEGER,
    comp_max INTEGER,
    comp_currency TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    content_hash TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    score INTEGER,
    score_model TEXT,
    score_rationale TEXT,
    matched_json TEXT,
    missing_json TEXT,
    first_seen_at INTEGER NOT NULL,
    last_seen_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS opp_owner_pipeline ON opportunities(owner_sub, pipeline, status, first_seen_at DESC)`,
  `CREATE INDEX IF NOT EXISTS opp_owner_recent ON opportunities(owner_sub, first_seen_at DESC)`,
  `CREATE INDEX IF NOT EXISTS opp_owner_score ON opportunities(owner_sub, score DESC)`,
  `CREATE INDEX IF NOT EXISTS opp_owner_hash ON opportunities(owner_sub, content_hash)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS opp_source_external ON opportunities(owner_sub, source_id, external_id)`,
  `CREATE TABLE IF NOT EXISTS opportunity_skills (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    opportunity_id TEXT NOT NULL,
    skill TEXT NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS opp_skills_opp ON opportunity_skills(owner_sub, opportunity_id)`,

  `CREATE TABLE IF NOT EXISTS scores (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    opportunity_id TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    matched_json TEXT NOT NULL DEFAULT '[]',
    missing_json TEXT NOT NULL DEFAULT '[]',
    rationale TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL DEFAULT 'rules',
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS scores_opp ON scores(owner_sub, opportunity_id, created_at DESC)`,

  `CREATE TABLE IF NOT EXISTS applications (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    opportunity_id TEXT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'qualifying',
    position REAL NOT NULL DEFAULT 0,
    next_action_at INTEGER,
    notes TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS applications_owner ON applications(owner_sub, stage, position)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS applications_opp ON applications(owner_sub, opportunity_id)`,

  `CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    opportunity_id TEXT,
    kind TEXT NOT NULL,
    actor TEXT NOT NULL DEFAULT 'human',
    body TEXT NOT NULL,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS activities_owner ON activities(owner_sub, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS activities_opp ON activities(owner_sub, opportunity_id, created_at DESC)`,

  // One generated application kit per opportunity. Stored as JSON so the shape can
  // grow without a migration; the model that wrote it is kept for auditability.
  `CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    owner_sub TEXT NOT NULL,
    opportunity_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    content_json TEXT NOT NULL,
    model TEXT,
    created_at INTEGER NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS documents_opp ON documents(owner_sub, opportunity_id, kind)`,
]

const ready = new WeakMap<D1Database, Promise<void>>()

export function ensureSchema(db: D1Database): Promise<void> {
  let pending = ready.get(db)
  if (!pending) {
    pending = db
      .batch(SCHEMA.map((sql) => db.prepare(sql)))
      // Added after the first release. SQLite has no `ADD COLUMN IF NOT EXISTS`, and
      // a failed statement would poison the batch, so it runs separately and its
      // "duplicate column" error is expected on every boot after the first.
      .then(() => db.exec('ALTER TABLE opportunities ADD COLUMN tags_json TEXT').catch(() => undefined))
      // Application kits read these two: a GitHub login to source real projects from,
      // and free-text work history (there is no separate experience table).
      .then(() => db.exec('ALTER TABLE profiles ADD COLUMN github TEXT').catch(() => undefined))
      .then(() => db.exec('ALTER TABLE profiles ADD COLUMN experience TEXT').catch(() => undefined))
      .then(() => undefined)
      .catch((error) => {
        ready.delete(db)
        throw error
      })
    ready.set(db, pending)
  }
  return pending
}

/** Rejects early with a clear message when the database binding is missing. */
export const requireDb: MiddlewareHandler<AppContext> = async (c, next) => {
  const db = c.env.DB
  if (!db) {
    return c.json(
      {
        error: 'database_missing',
        message: 'No database is attached yet. Add D1 storage named DB and redeploy.',
      },
      503,
    )
  }
  await ensureSchema(db)
  c.set('db', db)
  await next()
}

export const id = () => crypto.randomUUID()
export const now = () => Date.now()

type Row = Record<string, unknown>

const str = (v: unknown) => (v === null || v === undefined ? null : String(v))
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const bool = (v: unknown) => (v === null || v === undefined ? null : Number(v) === 1)

export function parseJson<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function mapSource(r: Row) {
  return {
    id: r.id as string,
    adapter: r.adapter as string,
    label: r.label as string,
    kind: r.kind as 'ats' | 'tender' | 'feed' | 'community' | 'manual',
    pipeline: r.pipeline as 'individual' | 'business' | 'both',
    enabled: Number(r.enabled) === 1,
    health: r.health as 'ok' | 'idle' | 'degraded' | 'failing' | 'unconfigured',
    lastRunAt: num(r.last_run_at),
    lastError: str(r.last_error),
    note: (r.note as string) ?? '',
    attributionLabel: (r.attribution_label as string) ?? '',
    attributionUrl: (r.attribution_url as string) ?? '',
    foundTotal: Number(r.found_total ?? 0),
    insertedTotal: Number(r.inserted_total ?? 0),
  }
}

export function mapRun(r: Row) {
  return {
    id: r.id as string,
    sourceId: r.source_id as string,
    sourceLabel: str(r.source_label) ?? undefined,
    startedAt: Number(r.started_at),
    finishedAt: num(r.finished_at),
    found: Number(r.found ?? 0),
    inserted: Number(r.inserted ?? 0),
    duplicates: Number(r.duplicates ?? 0),
    errors: Number(r.errors ?? 0),
    status: r.status as 'running' | 'ok' | 'partial' | 'failed',
    message: str(r.message),
  }
}

export function mapOpportunity(r: Row) {
  return {
    id: r.id as string,
    pipeline: r.pipeline as 'individual' | 'business',
    signalType: r.signal_type as 'explicit' | 'emerging',
    title: r.title as string,
    org: str(r.org),
    url: r.url as string,
    sourceId: str(r.source_id),
    sourceLabel: str(r.source_label),
    sourceAdapter: str(r.source_adapter),
    sourceKind: str(r.source_kind) as 'ats' | 'tender' | 'feed' | 'community' | 'gig' | 'directory' | 'manual' | null,
    location: str(r.location),
    remote: bool(r.remote),
    excerpt: (r.excerpt as string) ?? '',
    publishedAt: num(r.published_at),
    deadline: num(r.deadline),
    compMin: num(r.comp_min),
    compMax: num(r.comp_max),
    compCurrency: str(r.comp_currency),
    status: r.status as 'new',
    score: num(r.score),
    scoreModel: str(r.score_model),
    scoreRationale: str(r.score_rationale),
    confidence: Number(r.confidence ?? 0.5),
    skills: parseJson<string[]>(r.skills_json, []),
    firstSeenAt: Number(r.first_seen_at),
    lastSeenAt: Number(r.last_seen_at),
  }
}

export function mapProfile(r: Row) {
  return {
    id: r.id as string,
    kind: r.kind as 'individual' | 'business',
    name: r.name as string,
    headline: str(r.headline),
    summary: str(r.summary),
    location: str(r.location),
    isPrimary: Number(r.is_primary) === 1,
    skills: [] as string[],
    services: [] as { service: string; summary: string | null; evidence: string | null }[],
    eligibility: parseJson<Record<string, string>>(r.eligibility_json, {}),
    filled: false,
  }
}

export function mapActivity(r: Row) {
  return {
    id: r.id as string,
    kind: r.kind as string,
    actor: r.actor as 'human' | 'agent' | 'source',
    body: r.body as string,
    createdAt: Number(r.created_at),
  }
}

export function mapApplication(r: Row) {
  return {
    id: r.id as string,
    opportunityId: r.opportunity_id as string,
    oppTitle: str(r.opp_title) ?? undefined,
    org: str(r.org),
    pipeline: (r.pipeline as 'individual' | 'business') ?? undefined,
    score: num(r.score),
    stage: r.stage as 'qualifying',
    position: Number(r.position ?? 0),
    nextActionAt: num(r.next_action_at),
    notes: str(r.notes),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
  }
}

export const OPP_SELECT = `
  SELECT o.*,
    s.label AS source_label,
    s.adapter AS source_adapter,
    s.kind AS source_kind,
    substr(replace(replace(o.body, char(10), ' '), char(13), ' '), 1, 240) AS excerpt,
    (SELECT json_group_array(sk.skill) FROM opportunity_skills sk
       WHERE sk.opportunity_id = o.id AND sk.owner_sub = o.owner_sub) AS skills_json
  FROM opportunities o
  LEFT JOIN sources s ON s.id = o.source_id AND s.owner_sub = o.owner_sub`

export const APP_SELECT = `
  SELECT a.*, o.title AS opp_title, o.org AS org, o.pipeline AS pipeline, o.score AS score
  FROM applications a
  JOIN opportunities o ON o.id = a.opportunity_id AND o.owner_sub = a.owner_sub`
