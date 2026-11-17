<div align="center">

# Moey

**An opportunity engine with a memory and a conscience.**

It finds work that is actually being advertised, scores it against a real profile, and writes the
application from evidence it can point at. When a fact is missing, it says so instead of inventing one.

![tests](https://img.shields.io/badge/tests-39%20passing-2f6f4f?style=flat-square)
![stack](https://img.shields.io/badge/stack-TypeScript%20%C2%B7%20React%20%C2%B7%20Workers-1f6feb?style=flat-square)
![data](https://img.shields.io/badge/data-local%20D1-24292f?style=flat-square)
![sends](https://img.shields.io/badge/sends-nothing%20without%20you-8b3a3a?style=flat-square)

</div>

---

Two books of business, one engine: **individual work** (jobs, freelance briefs) and **Mitemshub engagements**
(prospects you approach yourself). They share the pipeline, the scoring vocabulary and the audit trail, and stay
separate everywhere it matters — separate profiles, separate eligibility, separate drafts.

The rule under all of it is old-fashioned and non-negotiable: every row can be traced back to the sentence that
produced it. If the trail breaks, the row says so rather than dressing up a guess.

```
   sources                one shape                trust                judgement              output
┌───────────┐        ┌──────────────┐        ┌──────────────┐      ┌───────────────┐      ┌────────────────┐
│ 18        │        │ normalise    │        │ 3-pass       │      │ rule score    │      │ CV · letter    │
│ adapters  │──────▶ │ hash · url   │──────▶ │ dedupe       │────▶ │ + model pass  │────▶ │ email · gaps   │
│ registry  │        │ canonical    │        │ provenance   │      │ you decide    │      │ evidence list  │
└───────────┘        └──────────────┘        └──────────────┘      └───────────────┘      └────────────────┘
      │                      │                      │                      │                       │
      └──────────────────────┴──────────────────────┴──────────────────────┴───────────────────────┘
                                  every step stored, per row, readable later
```

## Quickstart

```sh
npm install
npm run dev        # http://localhost:5173, local D1 via Miniflare
npm run typecheck
npm test
npm run build      # dist/client + dist/opportunity-engine/index.js
```

On localhost with no `FREEBUFF_CLIENT_ID` you are signed in as a local development user, so the app runs before
auth exists. A fresh workspace is seeded with two profiles and the source registry, and with **zero opportunities**.
Sample rows would have meant inventing postings, which is the one thing this product cannot do.

## What a row gives you

| Stage | What happens | Why it is built that way |
| --- | --- | --- |
| **Discover** | 20 adapters — Greenhouse, Lever, Ashby, Jobicy, Remotive, RemoteOK, Himalayas, Working Nomads, Arbeitnow, We Work Remotely, Freelancer, Braintrust, CryptoJobsList, Hacker News, Mastodon, EU TED, SAM.gov, OSM business listings, dead-site checks, DataAnnotation — each with its own enable switch, config and health state. | Only platforms that permit reading. What was refused and why is written down in [`docs/SOURCES.md`](docs/SOURCES.md). |
| **Normalise** | Every payload becomes one opportunity shape: title, organisation, location, body, URL, dates. | Downstream code should not know which platform a row came from. |
| **Dedupe** | Three passes: content hash, canonical URL, and fuzzy title/organisation matching. | The same job reaches you through a board, an aggregator and a company page. You should see it once. |
| **Score** | Skill vocabulary and rules first, model second — and only for rows that cleared the rule threshold. | A scan of 500 rows must not mean 500 model calls. |
| **Decide** | You accept, dismiss or snooze. The decision is logged with its timestamp. | Nothing leaves the board on its own. |
| **Draft** | A CV, cover letter and outreach email assembled from the posting plus your own stated facts. | See below. This is the part people actually feel. |

**Leads** deserve a note. Only advertised opportunities reach the board; emerging signals stop at a review queue
until someone confirms there is a real posting behind them.

## Application kits

Writing something true about a specific posting is the expensive part of applying. A kit is generated server-side,
stored against the opportunity, and re-readable from the detail view, so you are never re-rolling a draft you liked.

What goes in: the stored posting text, your profile (headline, summary, skills, services, free-text experience) and up
to 30 recent public repositories from the GitHub username on that profile.

What the model is forbidden to do, in the prompt and again in the post-processing:

- invent an employer, role title, date, degree, certification, client name or metric;
- claim a requirement your inputs do not evidence — those become a **gaps** list instead of a line in the letter;
- pad a thin history into a long one. A short CV is the correct answer when the facts are short.

Every response carries an `evidence` list mapping each claim to where it came from, so an unearned line is visible
before it reaches an employer. A separate check flags figures in the draft that appear nowhere in your inputs.

**With no model key at all**, the kit still works: it *assembles* rather than writes, composing your profile
verbatim, using repository descriptions as project evidence, and stating in the letter and footer that no writing
model was used. Missing keys cost polish. They never cost truth.

Kits are stored in `documents` as JSON alongside the model name, so any draft can be traced to what wrote it.

### The email, and why sending stays manual

Each kit also includes the message that would carry the application: a subject naming the role, and a body under 120
words that points at one concrete thing in the posting.

- **Contacts are read, never constructed.** Addresses and phone numbers come only from text the posting published.
  `careers@theirdomain` is a guess wearing a suit, so a posting with no address reports that there is nothing to
  send to. No-reply addresses are dropped; `hero@2x.png` is not mistaken for a person.
- **The Send tab hands you the controls.** `mailto:` opens your own client with subject and body prefilled, `tel:`
  does the same for a recorded number, and "Original posting" covers the rest.
- **Nothing is sent, ever.** No SMTP, no API, no background job. A mail link also cannot attach files, so the panel
  tells you to download the `.md` from the CV tab and attach it, or paste the letter in yourself.

## Models, and how they stay free

Providers are tried in order and the first one that answers wins. A rate limit, a timeout or an unparseable reply
moves to the next; if all of them fail, the kit falls back to the assembled version instead of erroring.

| # | Provider | Needs | Free allowance | Variable |
| --- | --- | --- | --- | --- |
| 1 | Freebuff API | key + credits | paid | `OPENAI_API_KEY` |
| 2 | Groq | free key, no card | ~30 req/min, 1,000 req/day | `GROQ_API_KEY` |
| 3 | OpenRouter | free key | ~20 req/min, 50 req/day on `:free` models | `OPENROUTER_API_KEY` |
| 4 | Google AI Studio | free key | per-model daily quota | `GEMINI_API_KEY` (default `gemini-3.6-flash`) |
| 5 | GitHub Models | token with Models access | per-model free tier | `GITHUB_TOKEN` + `GITHUB_MODEL` (opt-in) |
| 6 | Cerebras | free key | ~1M tokens/day per model | `CEREBRAS_API_KEY` |
| 7 | Pollinations | none | anonymous, one draft at a time is realistic | optional `POLLINATIONS_API_KEY` |
| 8 | LLM7 | none | shared and heavily throttled | optional `LLM7_TOKEN` |

`LLM_PROVIDER=groq` forces a single provider. Every model name is overridable (`GROQ_MODEL`, `GEMINI_MODEL`, …)
because free catalogues rename models without warning.

Three things we learned the hard way, recorded so nobody repeats the afternoon:

- **Google counts free quota per model.** `gemini-3-flash-preview` answered well for an afternoon and then returned
  429 `RESOURCE_EXHAUSTED` while the account still had quota everywhere else. `gemini-3.6-flash` and
  `gemini-3.5-flash` answered a full drafting payload in 1.6 s and 2.6 s with valid JSON, so those are the default and
  the first retry. `gemini-3.7-flash` and `gemini-flash-latest` exceeded 45 s on the same payload, and
  `gemini-2.5-flash` still 404s for new keys, so neither is in the list. Any 404, 429 or 5xx moves to the next id.
- **GitHub Models is opt-in on purpose.** A fine-grained token without Models access returns HTTP 200 with the
  literal body `OK` for every model name and even for the catalogue endpoint, which is a guaranteed failed round
  trip on every draft. It joins the chain only when `GITHUB_MODEL` is set, and then the token needs Models read
  access. Set one only after the endpoint returns JSON to a request of your own.
- **Keyless is real but thin.** Pollinations produced a complete draft in about 12 s with `reasoning_effort: low`.
  LLM7 answered once, then rejected its own anonymous token and timed out on a real draft, so it is tried last and
  never assumed.

One deliberate omission: no `gpt4free`-style project. Those reverse-engineer other companies' chat interfaces, break
their terms, get keys and IPs banned, and cannot run in a Worker. The legitimate maintained lists
(`nejib1/Free-LLM`, `OuterSpacee/free-ai-apis`, `tomaszas/litellm-free-models-proxy`, and the now-deleted
`cheahjs/free-llm-api-resources`) all point at the same handful of real tiers, which is what the table encodes.

## Your GitHub token, and what it is and is not doing

`GITHUB_TOKEN` does two separate jobs, and it is worth being precise because the two are easy to confuse.

**1. It authenticates repository reads.** When a profile has a GitHub username, the kit fetches that account's recent
public repositories as project evidence. Anonymous GitHub API calls are limited to 60 per hour, which a few rebuilds
will exhaust; with the token the limit is 5,000 per hour and the request carries a `user-agent`. The token is sent
only to `api.github.com`, never to a model provider and never to the browser.

**2. It can unlock GitHub Models as a fallback LLM**, if the token carries Models access *and* you name a model in
`GITHUB_MODEL`. Without that permission the service answers `200` with the literal body `OK`, so a configured token
sits off the chain by default rather than spending a failed request on every draft.

What the token is **not** used for: it does not choose which repositories appear. That comes from the username field
on your profile, so a CV only shows what you decided to show. Private repositories are filtered out even when the
token could read them — a CV is not the place to expose a client's confidential project name.

If a kit says *"No GitHub username is set on this profile"*, the token is irrelevant to that draft: set the username
in Settings → Profile.

## Configuration

Copy `.env.example` to `.env`. Both stay local; `.env` is git-ignored. `npm run dev` syncs `.env` into `.dev.vars`,
which is what the local Worker actually reads, so there is one file to edit. Every provider variable is forwarded —
if a new key is added to the sync script, a test fails.

| Variable | Used for | Local default | On Sites |
| --- | --- | --- | --- |
| `GITHUB_TOKEN` | Repository reads + GitHub Models | optional | **Sites → Secrets** |
| `GEMINI_API_KEY` | Google AI Studio | optional | **Sites → Secrets** |
| `OPENAI_API_KEY` | Freebuff API | empty = no paid provider | **Sites → Secrets**, see <https://freebuff.com/account/api> |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY`, `CEREBRAS_API_KEY` | Alternate free tiers | optional | **Sites → Secrets** |
| `OPENAI_BASE_URL`, `OPENAI_MODEL` | Endpoint and model overrides | Freebuff defaults | optional |
| `INGEST_SECRET` | External runner (`/api/ingest/*`) | any string | **Sites → Secrets**; without it those routes return 503 |

Secrets apply to the running Worker, so the order is: deploy once, then set them. No redeploy needed.

With no provider key at all the engine still runs: scores are tagged `rules`, the model gate is skipped, and the
interface says so plainly.

## Hosting: why the app is not on GitHub Pages

**Live preview: <https://site-fe76456ceb3740f9a330fdd592e29646.freebuff.page>**

GitHub Pages serves static files only. The client calls `/api/*` on its own origin, so a Pages deployment of
`dist/client` returns the shell and a `404` for every read — verified, not assumed. Moey needs D1 for the rows, a
Worker route for drafting, and a session so one account cannot read another's data, so it runs on a Worker.

Pages is still used, for the one thing it can honestly do: `pages/` is a static front door that explains the
product and opens the working app. `.github/workflows/pages.yml` publishes it on every push that touches `pages/`,
which is why the Pages settings show GitHub Actions as the source. Nothing needs to be run by hand.

## Install it as an app

A web manifest, a service worker and 192/512/maskable icons ship with the build, so the app installs and opens in
its own window.

```sh
npm run build && npm run preview
```

Chrome and Edge offer an install icon in the address bar, or ⋮ → *Install Opportunity Engine*. Safari: *Share → Add
to Dock*.

The service worker never caches `/api/*`. A cached opportunity would look live while being stale, which is the exact
dishonesty this product exists to avoid. In development it is a pass-through, so Vite's hot reload is untouched.

## How it is put together

| Path | What lives there |
| --- | --- |
| `src/worker/adapters.ts` | Adapter interface and all 18 implementations |
| `src/worker/ingest.ts` | The single write path: dedupe, score, persist, log |
| `src/worker/qualify.ts` | Skill vocabulary, rule scoring, optional model pass |
| `src/worker/model.ts` | Provider chain, per-provider quirks, JSON recovery |
| `src/worker/routes/kit.ts` | GitHub sourcing, evidence-bound drafting, honest no-key fallback |
| `src/worker/db.ts` | Schema (created on first request) and row mappers |
| `src/app/` | React app; `components/Provenance.tsx` is the signature component |
| `src/app/components/ApplicationKit.tsx` | Kit panel, five tabs, Markdown export |
| `public/manifest.webmanifest`, `public/sw.js` | Installability and the offline shell |
| `scripts/discover.mjs` | External runner used by the scheduled job |
| `docs/` | Audit, architecture, component register, source legality |
| `design/` | Brief, references, assets, copy deck |

## Deploying to Freebuff Sites

1. `sites_create`, then `sites_add_storage` with D1 bound as `DB`.
2. `sites_enable_auth`, passing `http://localhost:5173` as the local origin.
3. Set `INGEST_SECRET`, plus whichever provider keys you want.
4. `npm run build`, then `sites_deploy` with `deploy.json`.

Scheduling lives in `.github/workflows/discover.yml` rather than the Worker, because Sites exposes no cron or queue
bindings. Set `APP_ORIGIN` and `INGEST_SECRET` as repository secrets, and `SCAN_PLAN` as a repository variable.

## Boundaries

Every `/api/*` route requires a signed-in user and scopes its queries by `owner_sub`. Mutations must be same-origin.
`/api/ingest` is the single non-session write path: it fails closed without `INGEST_SECRET`, compares the bearer
token in constant time, caps a batch at 500 items, derives the owner from the source row rather than the caller, and
clamps every field. Personalised responses are `Cache-Control: private, no-store`.

What this milestone deliberately does not do: proposal and tender documents, client communication, delivery
coordination, billing, and the eight deferred agents described in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) §6.
They are listed so nobody assumes they exist.

One known limit. A kit writes from the posting text the adapter stored. When a source published only a title, the
kit is short and the gaps list explains why. It does not crawl the original page to make a draft look fuller.

## More reading

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — data model, pipeline, deferred agents
- [`docs/SOURCES.md`](docs/SOURCES.md) — every source, its terms, and the ones refused
- [`docs/AUDIT.md`](docs/AUDIT.md) — what was checked, and what was not
- [`docs/COMPONENTS.md`](docs/COMPONENTS.md) — component register and states
- [`docs/ROADMAP.md`](docs/ROADMAP.md) · [`docs/IDEAS.md`](docs/IDEAS.md) — next, and considered
