# Audit — Mitemshub Opportunity Engine (M1)

Written at the end of M1. Everything below was executed on this machine, in this workspace, against the local
Worker and a local D1 database. Where something was not verified, it says so instead of implying it.

---

## 1. What was run, and what it returned

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npx tsc --noEmit` | exit 0 |
| Unit tests | `npx vitest run` | 18 passed, 0 failed |
| Production build | `npm run build` | exit 0, `dist/` written |
| Live discovery (all sources) | `POST /api/sources/run-all` | 3 ran, 4 reported `disabled` |
| Dedupe on re-run | `POST /api/sources/run-all` again | **0 inserted / 91 duplicates** |
| Jobicy ingest | `POST /api/sources/src_…_jobicy/run` | found 50, inserted 50, 0 errors |
| TED ingest | `POST /api/sources/src_…_ted/run` | found 40, inserted 40, 0 errors |
| Re-score | `PATCH /api/profiles/:id` | 92 scores for 92 opportunities, 0 duplicates |
| Page render | all five routes walked in the browser | each rendered its heading, no error text |
| Console / network | browser logs | no errors or warnings; all API calls 200 |

Local dataset at audit time: **92 opportunities** (52 individual, 40 business), 86 ingested from live sources in
this session, 6 from the in-app manual path. Every row carries a source id, an external id, a content hash and an
activity-log entry.

## 2. Defects found by verifying, and fixed

These are the reason the verification pass was worth doing. Each was a real failure, not a style preference.

1. **`SQL.` at the end of a sentence was never detected.** The skill tokeniser kept the period so `next.js`
   survived, which meant a sentence-final `SQL.` did not match ` sql `. Fixed by stripping sentence-final periods
   before matching. Tests cover it.
2. **A single incidental body match could outrank a real fit.** Jobicy boilerplate mentions "automation", which
   put an accountant above a software engineer. Now one match with no support in the title is capped at 20/100.
3. **Jobicy was scored on a teaser.** The feed ships `jobExcerpt` *and* `jobDescription`; the adapter took the
   excerpt. Average body length went from a snippet to ~6,400 characters after the fix, and the top score rose
   from 27 to 42.
4. **TED returned notices from 2016.** `scope: ACTIVE` still includes qualification systems open for a decade,
   and the API returns `publication-date` as `2026-08-03+02:00`, which `Date.parse` rejects — so every notice
   looked undated and old ones were presented as current. Fixed with an explicit `publication-date>=YYYYMMDD`
   bound (the API 400s on an ISO date) and a parser for the offset form. Now 40/40 rows have a date inside the
   window and none are null.
5. **Scores doubled on every re-score.** The `scores` insert had no delete-or-upsert, so 92 opportunities
   accumulated 144 score rows. Fixed with a delete-then-insert per (opportunity, profile); verified stable at
   92/92 after a re-score. Existing duplicates were removed.
6. **Escaped entities reached the UI.** Real rows rendered `&hellip;` literally. Added a numeric + named entity
   decoder shared by the Worker and the discovery script; a sweep of all 86 ingested rows now finds zero.
7. **`run-all` silently omitted four sources.** The response listed three successes and said nothing about the
   four that could not run, which reads like a complete run. Every source is now reported with `disabled`,
   `no boards configured`, or its counts.

Also fixed during the build phase: the table's fixed columns left a ~1,150 px void and pushed the Trace column
off-screen (proportional widths now), and mobile forced horizontal scrolling on a 390 px viewport (Source and
Seen columns are now hidden below `sm`; the table fits at 379 px).

## 3. Scorecard

| Criterion | Score | Basis |
| --- | --- | --- |
| Functional completeness (M1 scope) | 8/10 | Both pipelines, all five screens, discovery, dedupe, scoring, provenance, manual path work end to end. Business-pipeline scoring is weak (see §4). |
| Correctness under real data | 8/10 | Seven real defects found and fixed by running it; dedupe proven by re-running the feed. |
| Provenance / honesty of claims | 9/10 | Every row links to source; decision log per opportunity; emerging signals labelled and blocked from the leads board; 0-scores now say *why* rather than implying irrelevance. |
| Design quality | 8/10 | One signature component (provenance rail), status-only colour, tabular numerals, dense table. Verified visually at 1440 and 390. |
| Accessibility | 7/10 | Real `table` semantics with `scope`, focus-visible rings, `sr-only` labels, reduced-motion guard. Not audited with a screen reader. |
| Legality / source discipline | 9/10 | Nine sources refused in writing with evidence; adopted sources documented per platform. |
| Operational honesty | 9/10 | Four sources ship disabled rather than pretending to work; ingest fails closed without a secret. |
| **Overall** | **8.3/10** | A working, honest M1 — not a finished product. |

## 4. What is genuinely weak

- **Business-pipeline scoring is near-useless in rules-only mode.** TED notices are frequently non-English and
  titled by CPV category ("Software package and information systems"), so the English skill vocabulary finds
  nothing and the row scores 0. The rationale now says exactly that, and the model qualifier is the intended fix,
  but it is not enabled here: there is no `OPENAI_API_KEY` in this environment. **No model call was made at any
  point in this build.** Every score in the database came from the deterministic rule engine.
- **"High fit" (≥60) is unreachable without the model.** The dashboard therefore shows `HIGH FIT 0` next to a
  mean of 8. That is an accurate report of a rule-only engine on thin data, not a broken chart — but it reads
  badly, and the honest fix is enabling the qualifier, not lowering the threshold.
- **Profile skills are placeholders.** Test skills were used to exercise scoring. Real scores require the user's
  real skills, services and eligibility facts.
- **Four sources are disabled** because they need a curated board list (Greenhouse, Lever, Ashby) or a key
  (SAM.gov). ATS discovery is only as good as that list; it is not a global search.
- **Eligibility is modelled, not answered.** Nothing is marked applicable until the operator supplies facts.

## 5. What was **not** verified

- No deployment. Nothing was pushed to Freebuff Sites; `sites_deploy` was not called. The Worker has not been
  exercised under `workerd` with production bindings.
- Sign in with Freebuff was not exercised end to end — local runs use development auth mode.
- No screen-reader, keyboard-only or contrast-ratio audit (contrast was chosen against tokens, not measured).
- No load, rate-limit or cost measurement. Cost figures in the plan remain estimates.
- The GitHub Actions cron workflow was written but has never run (no push, no secret configured).
- Only three of the seven adapters have ever returned data from the live endpoint in this session.

## 6. Cost and risk register (estimates, not measurements)

| Item | Estimate | Confidence |
| --- | --- | --- |
| D1 storage for ~10k opportunities | well under 1 GB free tier | medium — not measured |
| Worker CPU per ingest of 500 items | < 1 s, no model; seconds with model at the gate | medium |
| Model calls per discovery run | only items scoring ≥ 35, so typically a minority | low — no key, no calls made |
| Risk: an ATS changes its JSON shape | adapter returns 0 items, source shows degraded | high likelihood over months |
| Risk: TED query cost grows with `limit` | capped at 100/page, 40 default | low |
| Risk: platform terms change | `docs/SOURCES.md` records the basis for each source; re-check quarterly | medium |

## 7. Trace block

| Decision | Source of authority |
| --- | --- |
| Two pipelines, never merged | `moey.md` §core concept; `docs/ARCHITECTURE.md` §3 |
| Status-only colour, single accent | `design/mitems-studio-os/06-COLOR_SYSTEM.md`; recorded in the brief's decision log |
| Display/body/mono type stack, tabular numerals | `07-TYPOGRAPHY_SYSTEM.md`, `08-SPACING_SYSTEM.md` |
| Dense table-first dashboard, one signature element | `16-DASHBOARD_DESIGN.md`, `18-SAAS_DESIGN.md` |
| Locked brief before UI | `00-CONSTITUTION.md`; `design/PROJECT_BRIEF.md` |
| Component adopt/reject with licence + status | `docs/COMPONENTS.md` (Art. VIII: no unexamined dependency) |
| Refused sources written down, not worked around | `moey.md` legality requirement; `docs/SOURCES.md` |
| Nothing auto-submitted, nothing fabricated | `AGENTS.md` hard constraints; enforced in the leads board and the detail copy |

## 8. Out of scope for M1 (named, not dropped)

CV generation, proposal writing, client communications, delivery coordination, billing/invoicing, and the eight
deferred agents. Enabling the model qualifier, curating the ATS board list, and deploying are the three steps
that would move this from "works on my machine" to "works for its owner".

---

## Addendum — review pass and social reach (same session)

**Verified after the changes:** `npx tsc --noEmit` exit 0 · `npx vitest run` 18/18 · `npm run build` exit 0 ·
`GET /api/ingest/plan` returns 401 without the bearer token and the enabled-source list with it ·
`node scripts/discover.mjs` fetched **4,065 items across 8 sources, 0 new, 0 failures** (all duplicates, which
is the dedupe proof at scale) · Mastodon adapter returned 40 posts.

**Duplication removed.** `scripts/discover.mjs` was 279 lines that re-implemented all seven adapters in
JavaScript alongside the TypeScript originals — two copies of every upstream contract. The runner is now ~50
lines that calls `GET /api/ingest/plan` and `POST /api/ingest/run`; the adapters exist once. The `SCAN_PLAN`
repository variable is gone.

**Bugs found while doing this:**

- Lever's starter tokens were wrong (`spotify`, `plaid` both 404) — replaced with `gopuff` and `coupa`, each
  verified against the live endpoint.
- Board-list sources were seeded disabled even when boards were configured, so three working adapters showed
  as broken. They are now enabled when a board list exists.
- Source seeding only ran on first workspace load, so **any adapter added later never appeared** for an
  existing workspace. Seeding now re-runs idempotently on every workspace read.
- Jobicy returns HTTP 400 for an unknown `industry` value; the proof script documents that.

**Added:** `mastodon` adapter (public hashtag timelines, emerging signals only), `.env`/`.env.example` with a
`predev` sync into `.dev.vars`, and `scripts/prove-discovery.mjs` (throwaway proof of the adapters).

**Not done, and why:** Reddit, X and Google are not scraped. Probed on 2026-11-14: Reddit's anonymous JSON
returns 403/HTML, Bluesky's public search returns 403, X and Google have no free read path. Scraping them
would break the product's own stated constraint and risk the operator's accounts. The lawful routes (own
OAuth credentials for Reddit/Bluesky, paid API for X/Google) are documented in `docs/SOURCES.md`.

## Addendum 2 — source expansion (same session)

**Correction to M1:** the initial build claimed 9 adopted sources but only 3 had ever returned data.
After the user pushed back, a probe of 21 endpoints found 6 more that are genuinely open, and the ATS
coverage was 16 hand-picked tokens. It is now 1,559 verified boards.

**Live now (5,292 opportunities):**

| Source | Rows |
| --- | --- |
| Greenhouse (20 boards, 40/board) | 2,643 |
| Lever (20 boards) | 1,306 |
| Ashby (20 boards) | 725 |
| Arbeitnow | 288 |
| Remote OK | 97 |
| Jobicy | 50 |
| Freelancer.com (gigs) | 43 |
| EU TED | 40 |
| Mastodon | 40 |
| We Work Remotely | 21 |
| Himalayas | 20 |
| Remotive | 16 |
| HN | 2 |
| Working Nomads | 1 (33/34 overlapped other feeds) |

**Bugs found by doing this:** one slow ATS board aborted the whole source (now caught per board);
the `/run` timeout was too tight for a 700-posting board; existing source rows kept stale board configs
after the registry's defaults changed.

**Known limit, not fixed:** a 20-board Lever run takes ~110s because several boards are slow. That is fine
locally and risky under a deployed Worker's wall-clock budget — large board lists should be split across
several runner calls. The runner already calls one source at a time; it would need to chunk by board.

**Still refused:** Indeed, Glassdoor, LinkedIn, Dice (explicit robots/ToS blocks) and Remote.co (403).

## Addendum 3 — prospecting source and tooling

**Added:** `osm` adapter (OpenStreetMap businesses with no website — the first source that creates work leads
instead of waiting for postings). Verified end to end: one Lagos restaurant with a street address and no site.

**Installed as requested:** Scrapling 0.5.1 (`pip install "scrapling[fetchers]"`, BSD-3-Clause). Smoke test
returned HTTP 200 and the page title. Note: the base package alone lacks `curl_cffi` and fails on import; the
`[fetchers]` extra is required. Its CLI scripts are not on PATH.

**Correctness fixes while building it:** the OSM bounding box was inverted (`west > east`), which Overpass
read as an anti-meridian span and returned places from Malaysia and Nigeria for a West-African box; the
location fallback showed the query box instead of the place; per-mirror timeouts were shorter than Overpass
needs; the response type was inferred as `never` and blocked the build.

**Honest state on "global":** Greenhouse/Lever/Ashby surface whichever employers are in the board list, which
is US-heavy. The worldwide-remote feeds (Remote OK, Remotive, Himalayas, We Work Remotely, Arbeitnow) are
global by nature. Geographic breadth is now a function of the `area` you give the OSM source, not of luck.

## Addendum 4 — prospects become leads

**Prospect scoring.** Adapters now tag rows (`no-website`, `dead-website`, `social-only`) and the tags are
persisted in a new `opportunities.tags_json` column, so re-scoring knows what kind of row it is. A prospect is
scored on what matters for a gap rather than for a posting: whether the profile offers a matching service (45),
the severity of the gap (dead site +15, social-only +8, absent +10), whether the business is contactable
(phone +10, street address +8), minus the existing entity penalty. A profile with no web/software/data service
is capped at 25 with a reason.

Result on real data — the business pipeline is now led by prospects: dead websites 56–66, businesses with no
website 43–51.

**Bigger area, one request.** The OSM source accepts `areas` (several boxes) and unions them into a single
Overpass query, so the default covers four Lagos districts instead of one. Inverted boxes are dropped rather
than sent (an inverted box is an anti-meridian span).

**Dead-site checker (`osmdead`).** Queries businesses that DO list a website, then checks each one: 404/410 or
a domain that no longer resolves → dead; a parked/for-sale page → parked; a Facebook/Instagram/Linktree URL →
social-only. Verified against a Berlin box: **5 real businesses with dead websites, scoring 56–66.** Against
Lagos it returns 0 — because OSM records almost no `website` tags on Lagos businesses (verified directly: 0
candidates with a website in two districts). That is a data-coverage fact, not a bug.

**Limit:** each candidate is one live request to a third-party site, so the batch is capped at 40 and belongs in
the scheduled runner, not an interactive click.

**AI-lab platforms:** registered in `docs/AI_PLATFORMS.md` with live-role counts and published rates. Mercor,
DataAnnotation and Alignerr publish public listings (verified 200); Outlier, micro1, Handshake, Mindrift and
CrowdGen are application-gated. None is wired: each needs its own terms review and a parser that fails loudly.
