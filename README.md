<div align="center">

# Moey

**An opportunity engine for two businesses: your own work, and Mitemshub's client work.**

It reads work that is already advertised, scores each row against a profile you filled in, and drafts the
application from evidence it can point at. Nothing leaves the board without you.

![stack](https://img.shields.io/badge/stack-TypeScript%20%C2%B7%20React%20%C2%B7%20Workers-1f6feb?style=flat-square)
![storage](https://img.shields.io/badge/storage-Cloudflare%20D1-24292f?style=flat-square)
![sends](https://img.shields.io/badge/sends-nothing%20without%20you-8b3a3a?style=flat-square)

</div>

---

## Quickstart

```sh
npm install
npm run dev        # http://localhost:5173, local D1 through the Cloudflare Vite plugin
npm run typecheck
npm test
npm run build      # dist/client + dist/opportunity_engine/index.js
```

On localhost with no `FREEBUFF_CLIENT_ID` and no `APP_ORIGIN`, you are signed in as a single development user, so
the app runs before auth exists. A new workspace is seeded with two empty profiles and the source registry, and
with zero opportunities. Sample postings would mean inventing them, which is the one thing this product cannot do.

The test suite covers normalisation, dedupe, rule scoring, auth mode, environment syncing, kit parsing and model
response recovery. `npm test` is the source of truth for how many pass.

## What it does

```
sources  →  normalise  →  dedupe  →  score  →  your decision  →  kit
```

| Stage | What happens |
| --- | --- |
| Discover | 23 adapters, each with its own switch, config and health state. 22 of them run with no account or key at all; SAM.gov needs a free API key. |
| Normalise | Every payload becomes one opportunity: title, organisation, location, body, URL, dates, tags. |
| Dedupe | Three passes before anything is written: the source's own id, a content hash of title and organisation, then fuzzy title and organisation matching. One posting from a board, an aggregator and a company page arrives once. |
| Score | Rules first: a closed skill vocabulary, demand language, freshness, deadline, compensation. The model pass runs only on rows that scored 35 or more. |
| Decide | You move a row through new, reviewing, shortlisted, in progress, closed or rejected. Every change is timestamped. |
| Draft | A CV, cover letter and outreach email assembled from the posting plus facts you supplied. |

Every stage is stored per row, so a score or a draft can be traced back to the sentence that produced it. When a
fact is missing, the row says so.

## Sources

Only platforms whose terms allow reading. Each adapter caps a single employer board at 40 recent roles, so widening
a board list widens coverage instead of multiplying one employer's volume.

What was probed, what answered, and what refused access is recorded in [`docs/SOURCES.md`](docs/SOURCES.md), along
with the reason for each refusal.

Two work types reach the board. Employer boards and job feeds are salaried postings. Gig marketplaces, tender
notices, and any feed row that declares contract, freelance or temporary work in its own data are contract work.
The list marks each row GIG, CONTRACT or JOB, and the work filter keeps them apart. Classification uses what the
source publishes: its kind, or an employment-type field on the row. It never reads a title and guesses.

## Application kits

A kit is generated server-side, stored against the opportunity, and re-readable from the detail view.

Inputs are the stored posting text, your profile (headline, summary, skills, services, free-text experience), and up
to 30 recent public repositories from the GitHub username on that profile.

The prompt forbids inventing an employer, role, date, degree, certification, client or metric, and forbids claiming
a requirement the inputs do not evidence. Those become a gaps list. The response carries an evidence list mapping
each claim to its source, and a separate check flags figures that appear nowhere in your inputs.

Without any model key the kit is assembled from your profile verbatim, using repository descriptions as project
evidence. The letter and footer state that no writing model was used. Missing keys cost polish, not accuracy.

Kits are stored in `documents` as JSON with the name of the model that wrote them.

## The email, and why sending stays manual

Each kit includes a message that would carry the application: a subject naming the role, and a body of at most 120
words that points at one concrete thing in the posting.

Addresses and phone numbers come only from text the posting published. A posting with no address reports that
there is nothing to send to. No-reply addresses are dropped. `hero@2x.png` is not mistaken for a person.

The Send tab opens your own mail client with subject and body filled in, dials a recorded number, or links to the
original posting. There is no SMTP, no mail API and no background job anywhere in the codebase. A mail link cannot
attach files either, so the panel tells you to download the `.md` from the CV tab or paste the letter in yourself.

## Models

Providers are tried in order and the first one that answers wins. A rate limit, a timeout or unparseable JSON moves
to the next. If all of them fail, the kit falls back to the assembled version.

| # | Provider | Needs | Free allowance | Variable |
| --- | --- | --- | --- | --- |
| 1 | Freebuff API | key + credits | paid | `OPENAI_API_KEY` |
| 2 | Groq | free key, no card | about 30 req/min, 1,000 req/day | `GROQ_API_KEY` |
| 3 | OpenRouter | free key | about 20 req/min, 50 req/day on `:free` models | `OPENROUTER_API_KEY` |
| 4 | Google AI Studio | free key | per-model daily quota | `GEMINI_API_KEY` |
| 5 | GitHub Models | token with Models access | per-model free tier | `GITHUB_TOKEN` + `GITHUB_MODEL` |
| 6 | Cerebras | free key | about 1M tokens/day per model | `CEREBRAS_API_KEY` |
| 7 | Pollinations | none | anonymous, one draft at a time | optional `POLLINATIONS_API_KEY` |
| 8 | LLM7 | none | shared and heavily throttled | optional `LLM7_TOKEN` |

`LLM_PROVIDER=groq` forces one provider. Every model name can be overridden (`GROQ_MODEL`, `GEMINI_MODEL`, and so
on) because free catalogues rename models without notice.

Notes from building it:

- Google counts free quota per model. `gemini-3-flash-preview` answered well until its own quota ran out and
  returned 429 while the rest of the account still had allowance. The chain now prefers `gemini-3.6-flash`, then
  `gemini-3.5-flash`, then `gemini-3.1-flash-lite`, which all returned valid JSON within a few seconds on a full
  drafting payload.
- GitHub Models stays out of the chain until `GITHUB_MODEL` is set. A token without Models access answers HTTP 200
  with the literal body `OK`, so an always-on entry would spend a wasted request on every draft.
- Keyless endpoints are real but thin. Pollinations produced a complete draft. LLM7 answered once, then rejected
  its own anonymous token, so it is tried last.
- No `gpt4free` style project is included. Those reverse-engineer other companies' interfaces, break their terms,
  and cannot run in a Worker.

## GitHub token

`GITHUB_TOKEN` does two separate jobs.

Repository reads: when a profile has a GitHub username, the kit fetches that account's recent public repositories as
project evidence. Anonymous calls are capped at 60 per hour, which a few rebuilds will exhaust; with a token the
limit is 5,000 per hour. The token goes only to `api.github.com`, never to a model provider and never to the browser.

The fallback model: it can unlock GitHub Models when the token carries Models access and `GITHUB_MODEL` is set.

The token does not choose which repositories appear. That comes from the username on your profile, and private
repositories are filtered out even when the token could read them.

## Configuration

Copy `.env.example` to `.env`. Both files stay local and `.env` is git-ignored. `npm run dev` syncs `.env` into
`.dev.vars`, which is what the local Worker reads, so there is one file to edit. A test fails if a provider variable
stops being forwarded.

| Variable | Used for | Local default | On Sites |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | Repository reads, GitHub Models | optional | Sites → Secrets |
| `GEMINI_API_KEY` | Google AI Studio | optional | Sites → Secrets |
| `OPENAI_API_KEY` | Freebuff API | empty disables the paid provider | Sites → Secrets, from <https://freebuff.com/account/api> |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CEREBRAS_API_KEY` | Other free tiers | optional | Sites → Secrets |
| `OPENAI_BASE_URL`, `OPENAI_MODEL` | Endpoint and model overrides | Freebuff defaults | optional |
| `INGEST_SECRET` | External runner under `/api/ingest/*` | any string | Sites → Secrets; without it those routes return 503 |

Secrets apply to the running Worker, so deploy once and then set them. No redeploy is needed afterwards.

With no provider key at all, the engine still runs. Scores are tagged `rules`, the model gate is skipped, and the
interface says so.

## Running scans

Scheduling lives in `.github/workflows/discover.yml`, because Sites exposes no cron or queue bindings.
`scripts/discover.mjs` asks the Worker which sources are enabled and then runs them one at a time. Set `APP_ORIGIN`
and `INGEST_SECRET` as repository secrets. A run that the host answers with a 5xx is retried, because a measured
one in four requests came back as an unexplained 502 while identical runs succeeded seconds later.

Every inserted row costs about eight database writes: the opportunity, its matched skills, and the import line in
its activity trail. The deployment's daily allowance is 10,000 written rows, which leaves room for about 1,200 new
rows a day once the app's own reads and edits are counted.

A first sweep of a new source is the expensive moment. Steady-state scans mostly dedupe against rows already stored
and cost little. If a sweep exhausts the allowance, the host pauses the site until the reset shown on the Sites
panel, and data is kept.

## Hosting

**Preview: <https://site-fe76456ceb3740f9a330fdd592e29646.freebuff.page>**

The client calls `/api/*` on its own origin, so it needs a Worker and a database rather than static files. GitHub
Pages cannot serve either: a Pages deployment of `dist/client` returns the shell and a 404 for every read, which was
checked before deciding. The Worker owns the routes, D1 holds the rows, and a session stops one account from reading
another's data.

Pages is still used for what it can do honestly. `pages/index.html` is a static front door that describes the
product and links to the app, and `.github/workflows/pages.yml` publishes it when that directory changes.

The preview pauses when the hosting write allowance for the day is spent, so a 429 from it is usually the site
sleeping rather than a broken build. The Sites panel shows the reset time.

## Install it as an app

A web manifest, a service worker, and 192, 512 and maskable icons ship with the build, so the app installs and opens
in its own window.

```sh
npm run build && npm run preview
```

Chrome and Edge show an install icon in the address bar. Safari uses Share, then Add to Dock.

The service worker never handles `/api/*`. A cached opportunity would look live while being stale. In development
it is a pass-through, so hot reload is untouched.

## Code map

| Path | What lives there |
| --- | --- |
| `src/worker/adapters.ts` | Adapter interface and all 23 implementations |
| `src/worker/ingest.ts` | The single write path: dedupe, score, persist, log |
| `src/worker/qualify.ts` | Skill vocabulary, rule scoring, optional model pass |
| `src/worker/model.ts` | Provider chain and its per-provider quirks |
| `src/worker/rescore.ts` | Re-scores stored rows when a profile changes |
| `src/worker/routes/` | Opportunities, kits, sources, profiles, leads, workspace, ingest |
| `src/worker/db.ts` | Schema, created and migrated on first request |
| `src/worker/sources-registry.ts` | Seeds one row per adapter, including the default board list |
| `src/app/` | React app; `components/Provenance.tsx` is the signature component |
| `src/app/components/ApplicationKit.tsx` | Kit panel with CV, letter, send, gaps and evidence tabs |
| `public/manifest.webmanifest`, `public/sw.js` | Installability and the offline shell |
| `scripts/discover.mjs` | Runner used by the scheduled job |
| `scripts/sync-env.mjs` | Copies `.env` into `.dev.vars` before `npm run dev` |
| `docs/` | Architecture, source legality, audit, components, roadmap |
| `design/` | Brief, references, asset plan |

## Deploying to Freebuff Sites

1. Create the site, then add D1 storage bound as `DB`.
2. Enable auth, passing `http://localhost:5173` as the local origin.
3. Set `INGEST_SECRET` and any provider keys you want.
4. Run `npm run build`, then deploy with `deploy.json`, which points at `dist/opportunity_engine/index.js` and
   `dist/client`.

## Boundaries

Every `/api/*` route requires a signed-in user and scopes its queries by `owner_sub`. Mutations have to come from
the same origin. `/api/ingest` is the only write path that is not session-based: it fails closed without
`INGEST_SECRET`, compares the bearer token in constant time, caps a batch at 500 items, takes the owner from the
source row rather than the caller, and clamps every field. Personalised responses are
`Cache-Control: private, no-store`.

Not built, and listed so nobody assumes otherwise: proposal and tender documents, client communication, delivery
coordination, billing, and the deferred agents in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §6.

One limit worth knowing. A kit writes from the text the adapter stored. When a source published only a title, the
draft is short and the gaps list says why. It does not crawl the original page to make a draft look fuller.

## More reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): data model, pipeline, deferred agents
- [`docs/SOURCES.md`](docs/SOURCES.md): every source, its terms, and the ones refused
- [`docs/AUDIT.md`](docs/AUDIT.md): what was checked and what was not
- [`docs/COMPONENTS.md`](docs/COMPONENTS.md): component register and states
- [`docs/ROADMAP.md`](docs/ROADMAP.md) and [`docs/IDEAS.md`](docs/IDEAS.md): next, and considered
