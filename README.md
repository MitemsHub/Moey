# Mitemshub Opportunity Engine

An opportunity intelligence product for two separate books of business — **individual work** and
**Mitemshub engagements** — built around one rule: every row must be traceable to the sentence that produced it.

It discovers demand from sources that permit it, scores it against a profile, and keeps a provenance chain and
decision log for every record. From a row you can build a CV and cover letter grounded in that posting, your own
stated history and your public GitHub repositories. Nothing is auto-submitted anywhere, and nothing is invented
to fill a gap.

```
discover ──▶ normalise ──▶ dedupe ──▶ score ──▶ decide ──▶ draft
  18 sources    one shape     3 passes    rules+model   human      evidence-bound kit
       │             │             │            │           │              │
       └─────────────┴─────────────┴── provenance rail, every step stored ─┴──────────────┘
```

## Run it

```sh
npm install
npm run dev        # http://localhost:5173 with a local D1 (Miniflare)
npm run typecheck
npm test
npm run build      # dist/client + dist/opportunity-engine/index.js
```

On localhost with no `FREEBUFF_CLIENT_ID`, the app signs you in as a local development user, so it works before
auth is provisioned. A new workspace is seeded with **two empty profiles and the source registry** — and no
opportunities, because inventing sample rows would violate the brief.

## What it does

- **Sources** — seven adapters (Greenhouse, Lever, Ashby, Jobicy, Hacker News, EU TED, SAM.gov) with per-source
  enable, config and health. Refused platforms and why: `docs/SOURCES.md`.
- **Ingestion** — one write path for adapters and the external runner: normalise → hash → three-pass dedupe →
  rule score → optional model refinement → persist, with an activity row each time.
- **Profiles** — separate skills/services and eligibility for each pipeline. Eligibility is deliberately blank; the
  engine never assumes a fact about the operator.
- **Application kits** — for any row, a CV and cover letter assembled from the posting, the operator's profile
  (including a free-text experience field) and their public GitHub repositories. Every line carries its source;
  requirements the operator cannot evidence become a **gaps** list instead of a claim in the letter. Nothing is
  sent, and the model is never asked to invent an employer, date or metric.
- **Leads** — only advertised opportunities can enter the board. Emerging signals stop at review.
- **Memory** — filters, page, sort and scroll survive opening a row and coming back, and survive a full reload
  (`localStorage` for the query, `sessionStorage` for the scroll position). The list is a place you return to, not
  something that restarts.
- **Provenance** — `source → fetched → normalised → qualified → decision`, shown per row and in full on the detail
  view. A step that cannot be evidenced renders as missing rather than being omitted.

## Configuration

Copy `.env.example` to `.env`. Both are local-only; `.env` is git-ignored. `npm run dev` syncs it into
`.dev.vars` (which the local Worker actually reads), so there is one file to edit.

| Variable | Needed for | Local | On Sites |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | Model qualifier | empty = rules-only | **Sites → Secrets** after the first deploy. Get a key at <https://freebuff.com/account/api>. |
| `OPENAI_BASE_URL` | Model endpoint | defaults to the Freebuff API | optional, only to point elsewhere |
| `OPENAI_MODEL` | Model name | `gpt-4o-mini` | optional |
| `INGEST_SECRET` | External runner (`/api/ingest/*`) | any string | **Sites → Secrets**. Without it those routes return 503. |

Deploy order matters: deploy once, then set the secrets, then redeploy is not required — secrets apply
to the running Worker.

Without `OPENAI_API_KEY` the engine still works: every score is tagged `rules`, the model gate is skipped,
and the UI says so. With it, only rows whose rule score reached 35 are sent to the model, so a scan cannot
spend per row.

## Application kits

The feature exists because the expensive part of applying is not finding the posting, it is writing something true
for it. A kit is generated server-side, stored against the opportunity, and re-readable from the detail view.

- **Inputs**: the posting text, the profile (headline, summary, skills, services, experience), and up to 30 public
  repositories from the GitHub username set on that profile — nothing private, nothing posted back.
- **Guardrails**: the prompt forbids invented employers, titles, dates, degrees, certifications, client names and
  metrics; every bullet must trace to a supplied fact. The response includes an `evidence` list mapping each claim
  to where it came from, so an unearned line is visible before it reaches an application.
- **Without a model key** the kit is *assembled*, not written: it composes the CV from the profile verbatim, uses
  repository descriptions as project evidence, and says in the letter and the footer that no writing model was
  used. A missing key degrades the output's polish, never its truthfulness.
- **Stored** in `documents` as JSON with the model name, so a draft can always be traced to the model that wrote it.

A provider is picked automatically from whatever keys are configured — see *Free model providers* below. Nothing
has to be paid for.

## Free model providers

The engine tries providers in this order and uses the first one that answers; if one rate-limits or times out it
moves to the next, and if all of them fail the kit falls back to the assembled version above instead of erroring.

| # | Provider | Needs | Free allowance | Set |
| --- | --- | --- | --- | --- |
| 1 | Freebuff API | key + credits | paid | `OPENAI_API_KEY` |
| 2 | Groq | free key, no card | 30 req/min, 1,000 req/day | `GROQ_API_KEY` |
| 3 | OpenRouter | free key | 20 req/min, 50 req/day on `:free` models | `OPENROUTER_API_KEY` |
| 4 | Google AI Studio | free key | per-model daily quota | `GEMINI_API_KEY` |
| 5 | GitHub Models | any GitHub token | free tier per model | `GITHUB_TOKEN` |
| 6 | Cerebras | free key | ~1M tokens/day per model | `CEREBRAS_API_KEY` |
| 7 | Pollinations | **none at all** | anonymous tier; mostly good for one draft at a time | `POLLINATIONS_API_KEY` only to raise the budget |
| 8 | LLM7 | none at all | shared, heavily rate-limited | `LLM7_TOKEN` (optional) |

`LLM_PROVIDER=groq` (or any id above) forces one. Every model name is overridable
(`GROQ_MODEL`, `OPENROUTER_MODEL`, `GEMINI_MODEL`, …), because free catalogues rename models constantly.

Two honest notes. First, only the two keyless entries work with no setup at all, and they behave differently in
practice: Pollinations answered a full draft in ~12s with `reasoning_effort: low`, while LLM7 answered once and then
rejected the same anonymous token (`invalid_api_key`, `concurrent_request_limit_exceeded`) and timed out on a real
draft. LLM7 is therefore tried last and never assumed. Second, a draft that takes ~20s on a free tier is normal;
the panel shows a loading state, and if every provider fails the kit falls back to the assembled version instead of
erroring. Second, this deliberately does **not** use `gpt4free`-style projects: those reverse-engineer other
products' chat UIs, break their terms, get keys and IPs banned, and cannot run in a Worker anyway. The maintained
lists that are legitimate — `cheahjs/free-llm-api-resources` (deleted by its author in late 2026),
`nejib1/Free-LLM`, `OuterSpacee/free-ai-apis`, `tomasasz/litellm-free-models-proxy` — all point at the same
handful of real free tiers, which is what the table above encodes.

## Install it as an app (PWA)

The app ships a web manifest, a service worker and 192/512/maskable icons, so it installs from the machine it runs
on and opens in its own window.

- `npm run build && npm run preview` — the built app is installable and works offline for the shell.
- Chrome/Edge: address-bar install icon, or ⋮ → *Install Opportunity Engine*. Safari: *Share → Add to Dock*.
- The service worker never caches `/api/*`: a cached opportunity would look live while being stale, which is exactly
  the dishonesty this product exists to avoid. In development it is a pass-through so Vite's HMR is untouched.

## Where things are

| Path | What |
| --- | --- |
| `src/worker/adapters.ts` | Adapter interface + the seven implementations |
| `src/worker/ingest.ts` | The single write path (dedupe, score, persist) |
| `src/worker/qualify.ts` | Skill vocabulary, rule scoring, optional model pass |
| `src/worker/db.ts` | Schema (created on first request) and row mappers |
| `src/worker/routes/*` | Hono endpoints |
| `src/worker/routes/kit.ts` | GitHub sourcing, evidence-bound drafting, honest no-key fallback |
| `src/app/components/ApplicationKit.tsx` | Kit panel, tabs, Markdown export |
| `public/manifest.webmanifest`, `public/sw.js` | PWA install + offline shell |
| `scripts/make-icons.mjs` | Deterministic PNG icons, no dependencies |
| `src/app/` | React app; `components/Provenance.tsx` is the signature component |
| `scripts/discover.mjs` | External runner used by the GitHub Actions cron |
| `docs/` | Audit, architecture, component register, source legality |
| `design/` | Brief, references, assets, Studio OS copy |

## Deploying to Freebuff Sites

1. `sites_create`, then `sites_add_storage` with D1 named `DB`.
2. `sites_enable_auth` (pass `http://localhost:5173` as the local origin).
3. Set `INGEST_SECRET` (for the external runner) and, optionally, `OPENAI_API_KEY`.
4. `npm run build`, then `sites_deploy` with `deploy.json`.

Scheduling lives in `.github/workflows/discover.yml`, not in the Worker: Sites does not expose cron or queue
bindings. Set the `APP_ORIGIN`, `INGEST_SECRET` secrets and the `SCAN_PLAN` variable in the repository.

## Security notes

Every `/api/*` route requires a signed-in user and scopes queries by `owner_sub`. Mutations must be same-origin.
`/api/ingest` is the one non-session write path: it fails closed without `INGEST_SECRET`, compares the bearer token
in constant time, caps the batch at 500 items, derives the owner from the source row (never from the caller) and
clamps every field. Personalised responses are `Cache-Control: private, no-store`.

## Not in this milestone

Proposal and tender response documents, client communication, delivery coordination, billing, and the eight
deferred agents listed in `docs/ARCHITECTURE.md` §6. Named here so they are not silently implied.

One known limit of the kit: it writes from the posting text the adapter stored. If a source published only a
title, the kit is short and the gaps list is honest about why — it does not fetch the original page.
