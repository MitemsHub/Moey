# Architecture — Mitemshub Opportunity Engine (M1)

## 1. Shape

```
GitHub Actions cron (6-hourly)          Worker (Freebuff Sites)              D1
┌──────────────────────────┐           ┌──────────────────────────┐      ┌─────────────────┐
│ scripts/discover.mjs     │  POST     │ /api/ingest (authed)     │      │ sources         │
│  adapters → normalise    │ ────────► │  dedupe → triage → score │ ───► │ source_runs     │
│  bearer: INGEST_SECRET   │           │                          │      │ opportunities   │
└──────────────────────────┘           │ /api/opportunities       │ ◄──► │ scores          │
                                       │ /api/sources/:id/run     │      │ applications    │
         React app (Sites CDN)         │ /api/overview            │      │ activities      │
         ◄─────────────────────────────┤ /api/me /profiles        │      └─────────────────┘
                                       └──────────────────────────┘
```

Two ways a scan can run:

1. **In-Worker** — `POST /api/sources/:id/run` calls the adapter directly. Every adopted adapter is a plain
   `fetch` of a JSON endpoint, which is I/O, not CPU, so this fits a Worker invocation comfortably.
2. **External runner** — `scripts/discover.mjs` (Node 24, no dependencies) runs every enabled adapter and POSTs
   normalised items to `/api/ingest`. This is the scheduled path and the escape hatch for sources that later need
   a real browser.

Why not Workers cron: the Sites manifest exposes D1, R2, realtime and secrets, but not `triggers.crons` or queue
bindings. Scheduling therefore belongs outside the Worker. That also keeps the 15-minute CPU ceiling irrelevant.

## 2. Adapter interface

```ts
export interface Adapter {
  key: string                      // stable id, also the source primary key
  label: string
  kind: 'ats' | 'tender' | 'feed' | 'community' | 'manual'
  pipeline: Pipeline                // 'individual' | 'business' | 'both'
  attribution: { label: string; url: string; note: string }
  needs?: 'board-list' | 'api-key' | 'feed-urls'
  fetch(ctx: AdapterContext): Promise<RawOpportunity[]>
}

export interface RawOpportunity {
  externalId: string        // stable within the source; drives dedupe
  title: string
  org?: string
  url: string
  text?: string
  location?: string | null
  remote?: boolean | null
  publishedAt?: number | null
  deadline?: number | null
  compensation?: { min?: number; max?: number; currency?: string } | null
  signal?: 'explicit' | 'emerging'
  tags?: string[]
}
```

Adapters never write to D1. They return `RawOpportunity[]`; a single ingestion path normalises, dedupes, scores and
persists, so every source gets identical attribution, dedupe and audit behaviour.

## 3. Two pipelines

Kept strictly separate, per `moey.md` §2.

| | Individual | Business |
| --- | --- | --- |
| Unit | a role, gig, contract or assignment | a lead, tender or stated need |
| Matching input | skills, availability, eligibility | service catalogue, evidence of delivery, capacity |
| Stages | discovered → reviewing → preparing → applied → interviewing → closed | discovered → qualifying → contacted → proposal → won / lost |
| Extra gates | eligibility rules (age, right to work, platform terms) | entity requirements, insurance, references |

`pipeline` is a column, not a table split, so search and dedupe stay single-pass; the UI and the scoring profile
switch on it.

## 4. Database (D1 / SQLite)

```
profiles            id, owner_sub, kind(individual|business), name, headline, summary, location,
                    eligibility_json, capacity, is_primary, created_at, updated_at
profile_skills      id, owner_sub, profile_id, skill, level(1-5), evidence
profile_services    id, owner_sub, profile_id, service, summary, evidence

sources             id, owner_sub, adapter, label, kind, pipeline, enabled, config_json,
                    health(ok|degraded|failing|unconfigured), last_run_at, last_error, notes
source_runs         id, owner_sub, source_id, started_at, finished_at, found, inserted,
                    duplicates, errors, status, message

opportunities       id, owner_sub, pipeline, signal_type(explicit|emerging), title, org, url,
                    source_id, external_id, location, remote, body, published_at, deadline,
                    comp_min, comp_max, comp_currency, status, content_hash, first_seen_at,
                    last_seen_at, confidence, score, score_model, score_rationale
opportunity_skills  id, owner_sub, opportunity_id, skill
scores              id, owner_sub, opportunity_id, profile_id, score, matched_json, missing_json,
                    rationale, model, created_at

applications        id, owner_sub, opportunity_id, stage, position, next_action_at, notes,
                    created_at, updated_at
activities          id, owner_sub, opportunity_id, kind, actor(human|agent|source), body,
                    created_at            -- append-only decision/source log
```

Indexes cover the three real access paths: `(owner_sub, pipeline, status)`, `(owner_sub, first_seen_at DESC)`,
`(owner_sub, score DESC)`. `(owner_sub, source_id, external_id)` is unique — the source-level dedupe guard.

**FTS5 was not adopted.** Its availability on D1 could not be verified from this machine, and a search path that
fails at runtime is worse than a slower one. Search uses `LIKE` over indexed columns, which is adequate for the
MVP's expected row count (thousands, not millions). Recorded in the brief's decision log.

## 5. Ingestion pipeline

```
RawOpportunity
  → normalise      trim, collapse whitespace, strip HTML, parse dates, clamp lengths
  → identity       external_id + (normalised title|org) → content_hash
  → dedupe         exact (source, external_id) → exact content_hash → fuzzy (title+org token overlap ≥ 0.86)
  → triage         deterministic rules: skill hits, role/tender keywords, recency, deadline, source weight
  → qualify        score 0–100 against a profile; rationale recorded; optional LLM enrichment
  → persist        opportunity + skills + score + activity row
```

Two-stage triage is the cost control from the plan: rules run on everything, the LLM only on items that pass the
rule gate. Every score stores `model` and `rationale` so a later reviewer can tell a rule score from a model score.

## 6. Agents (3, not 11)

| Agent | Responsibility | Inputs | Outputs | Permissions |
| --- | --- | --- | --- | --- |
| **Scout** | run adapters, normalise, dedupe, persist | enabled sources + config | opportunities, source_runs | read sources, write opportunities |
| **Qualifier** | classify, extract skills, score per profile | opportunity + profile | score, matched/missing skills, rationale | read opportunity/profile, write scores |
| **Apply assistant** (M2) | draft CV/proposal text for human review | opportunity + profile | draft text, never submitted | read-only on the outside world |

The remaining named agents in `moey.md` §6 are features (a CRUD screen, a report, a reminder), not agents. Building
them as agents would add coordination cost with no measurable gain — Article VIII of the Studio Constitution.

## 7. Security

- Every `/api/*` route requires a user; every query is scoped by `owner_sub`. No endpoint accepts a client-supplied
  owner id.
- Mutations require same-origin (`isSameOriginRequest`).
- `/api/ingest` is bearer-authenticated with `INGEST_SECRET`; without the variable set it refuses every call rather
  than falling open. It is the one write path that is not user-session based, so it validates shape and clamps
  every field.
- Personalised responses are `Cache-Control: private, no-store`.
- Secrets live in `.dev.vars`/Sites secrets, never in source. `.gitignore` covers both.

## 8. Known limits

- ATS discovery is per-employer: without a curated board list the adapter finds nothing. The list is data, not code.
- No embeddings/vector matching in M1 (no Vectorize binding on Sites). Matching is skill-overlap plus rules.
- The qualifier without `OPENAI_API_KEY` is rules-only. It says so in the UI rather than implying model judgement.
- Nothing is auto-submitted anywhere, by design.

## 9. Discovery runner (revised)

An earlier version re-implemented all seven adapters in `scripts/discover.mjs` so the GitHub Actions job could
fetch and POST normalised items. That left two copies of every upstream API contract to keep in sync — the
exact duplication that makes an adapter break silently in one place and not the other.

The runner now carries no adapter logic at all:

1. `GET /api/ingest/plan` (bearer `INGEST_SECRET`) returns the enabled sources from the registry.
2. `POST /api/ingest/run` (same secret) runs **one** source server-side with the real adapter and ingests it.

One source per call because a large board does not fit one invocation: Greenhouse with eight employers returns
about 2,800 jobs and takes roughly 65 seconds. `scripts/discover.mjs` is now ~50 lines and `SCAN_PLAN` is gone —
the source registry is the single source of truth.
