# Source feasibility register

Every source named in `moey.md` §3 is classified here **before** code was written. The classification is what the
adapter layer implements: `open`, `credentialed`, `opt-in`, or `refused`. A refused source is not worked around —
`moey.md` §3 and §7 both forbid bypassing platform restrictions, so refusing is the compliant outcome.

Statuses: **Adopted** (shipped adapter) · **Ready** (adapter shaped, needs a key or a list) · **Deferred** ·
**Refused** (terms forbid it).

## Adopted — shipped in M1

| Source            | Access                                        | Terms / licence                                                          | Rate discipline                                   |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------- |
| Greenhouse boards | `boards-api.greenhouse.io/v1/boards/{token}/jobs` | Public endpoint that powers the employer's own careers page. No key.   | One request per board; `content=false` in bulk    |
| Lever postings    | `api.lever.co/v0/postings/{slug}?mode=json`     | Public, unauthenticated postings API.                                    | One request per company                           |
| Ashby job board   | `api.ashbyhq.com/posting-api/job-board/{board}` | Documented public job-posting API.                                       | One request per board                             |
| Jobicy            | `jobicy.com/api/v2/remote-jobs`                 | Public API; commercial use in SaaS explicitly permitted **with credit**.  | Credit shown in the row; poll ≤ 1/hour            |
| Hacker News       | `hn.algolia.com/api/v1/search`                  | Public Algolia search over HN.                                           | Query-driven, low volume                          |
| EU TED            | `POST api.ted.europa.eu/v3/notices/search`      | Free reuse, no key for published notices, ~700 req/min fair use.         | One POST per scan window                          |
| Manual submission | In-app form                                     | Always available; no third party involved.                               | n/a                                               |

## Ready — adapter written or shaped, needs a credential or a curated list

| Source                 | What it needs                                                | Note                                                                 |
| ---------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------- |
| SAM.gov opportunities  | Free API key (Account Details → public API key)              | Daily request caps per role. Stored as a secret, never in source.     |
| ATS board list         | A curated company → board-token list                         | The real work of ATS discovery. Seeded with a small starter set.      |
| RSS / Atom             | A list of feed URLs                                          | Works for newsletters and blogs that still publish feeds.            |

## Deferred — legal, but opt-in and per-community

| Source          | Why deferred                                                                                             |
| --------------- | -------------------------------------------------------------------------------------------------------- |
| Discord / Slack | Requires a bot installed in a server the operator belongs to. Per-community consent, not global discovery. |
| X               | Pay-per-usage credits, metered per resource read. Viable in small volume only; needs a spend decision.     |

## Refused — documented, not implemented

| Source                      | Evidence                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Reddit                      | Commercial use requires written approval and a contract. New public Data API requests closed 31 Oct 2026; RSS ended 13 Nov 2026; remaining public access ends March 2027. |
| LinkedIn                    | No search API for jobs or posts. Company-page access is partner-gated (Marketing Developer Platform). Scraping is prohibited and litigated. |
| Instagram / Facebook        | Graph API needs business verification and app review for the relevant permissions; personal-content harvesting is prohibited.            |
| TikTok                      | Research API is academic-only; no commercial discovery route.                                                                             |
| Upwork / Fiverr             | No public API. Manual submission is the compliant path.                                                                                   |
| Adzuna                      | Free key, but commercial use is a **14-day trial only**, after which a licence agreement is required. Not usable ongoing without a contract. |

## Consequence for the product

The "discovery must go beyond job boards" requirement is still met — but through sources where demand is
*published*, not through social platforms whose terms forbid harvesting:

- **Explicit demand:** ATS postings, tenders (TED, SAM.gov), remote job feeds.
- **Emerging demand:** HN discussions of operational pain, tender pre-market notices, job postings whose language
  reveals tooling gaps or vendor evaluation.

Emerging signals are stored with `signal_type = 'emerging'`, carry a confidence value, and can never enter the
leads board or be presented as a contract.

## Social platforms — what is actually reachable (tested 2026-11-14)

Every row below was probed with a real request from this machine on that date. "Open" means the endpoint
returned usable data with no credentials; "credentials" means it works only with a key the operator creates.

| Surface | Result | What it needs | Status |
| --- | --- | --- | --- |
| Mastodon hashtag timelines | **200, usable** — `mastodon.social/api/v1/timelines/tag/<tag>` | nothing | **Adopted** (`mastodon` adapter, emerging signals only) |
| DEV.to articles | **200, usable** — `dev.to/api/articles?tag=hiring` | nothing | Open, not wired yet |
| Stack Exchange | **200, usable** — `api.stackexchange.com/2.3/search/advanced` | nothing at low volume | Open, low opportunity density |
| Bluesky search | **403** — `public.api.bsky.app` refuses anonymous `searchPosts` | an account + app password | Deferred until the operator supplies one |
| Reddit (anonymous JSON) | **403 / HTML wall** on both `reddit.com` and `old.reddit.com` | OAuth app (`script` type), then 100 QPM | Documented, needs the operator's own credentials |
| X / Twitter | no public read path | paid API tier | Refused — not a scraping problem but a contract one |
| Google results | no free programmatic path | paid Search API or SERP reseller | Refused for the same reason |

The distinction that matters: **Mastodon is open because its public timelines are published for reading**.
Reddit, X and Google are not in the same position — their terms forbid automated collection without a
contract, and the probes above show they enforce it. Scraping them anyway would put the operator's account
and the product at risk for data that is already reachable through their own APIs. The honest options are
the operator's own credentials (Reddit, Bluesky) or a paid plan (X, Google).

## Endpoint probe — 21 sources tested (2026-11-14)

Run with `node scripts/probe-sources.mjs`. Every row is a live request; nothing here is assumed.

**Open and wired (14 live sources total):**

| Source | Result | Shape | Notes |
| --- | --- | --- | --- |
| Remotive | 200, 16 jobs | JSON | Attribution required |
| Remote OK | 200, 97 jobs | JSON | Terms require a link back; attribution row supplies it |
| Himalayas | 200, 20 jobs | JSON | Attribution required |
| Working Nomads | 200, 34 jobs | JSON | Most items overlap other feeds (dedupe caught 33/34) |
| Arbeitnow | 200, 300 jobs | JSON | EU-weighted, feeds both pipelines |
| We Work Remotely | 200, 25 feed items | RSS | Parse `Company: Role` titles |
| **Freelancer.com** | 200, 10 projects | JSON | **A gig marketplace**: named buyer, budget range, explicit demand |
| **Braintrust** | 200, 136 live rows | JSON | Contract network: 17 of 20 sampled rows were `freelance` (short or long), each with a USD budget. Public `/jobs/<id>/` page verified 200 |
| **CryptoJobsList** | 200, 100 feed items | RSS | Web3 roles. No company element and no publish date, so the employer comes from the link slug and freshness stays null |
| Jobicy | 200, 20 jobs | JSON | Already wired |
| Mastodon #hiring | 200, 10 posts | JSON | Already wired; emerging signals only |
| Greenhouse / Lever / Ashby | 1,559 verified boards | JSON | See below |
| EU TED / HN | — | JSON | Already wired |

**Tested and refused, with the evidence:**

| Site | Result | Why |
| --- | --- | --- |
| Indeed | RSS 404; `robots.txt` disallows `/api/fetch/*`, `/api/getrecjobs`, `/graphql` | No public read path; ToS forbids automated collection |
| Glassdoor | `robots.txt`: `Disallow: /jobview/`, `Disallow: /search/` | Explicit block |
| LinkedIn | `robots.txt`: `Disallow: /jobs?runSearch*` | Explicit block (matches the earlier finding) |
| Dice | `robots.txt` itself returns 403 | Blocks crawlers outright |
| Remote.co | RSS 403 | Blocks automated access |
| No Fluff Jobs | API 405 (POST-only), Hasjob 404 | Not usable as documented |

Probed again on 2026-11-17 for the gig and Web3 request: `weworkremotely.com/categories/remote-contract-jobs.rss` answers 301 with no
location, `web3.career` has no feed (404 on `/rss` and `/feed`), Dework's GraphQL endpoint answers 500 without a key, and both
code4rena and Immunefi expose no public listings endpoint. None of those were wired.

## ATS board list — 1,559 verified tokens

`github.com/Einsteinder/awesome-hiring-companies` publishes ~1,977 companies with `ats: { platform: slug }`.
The slugs are **not all current** (it lists Mistral on Lever, which now 404s), so
`scripts/build-board-list.mjs` checks every token against the live endpoint:

- 1,809 candidates checked → **426 Greenhouse, 214 Lever, 919 Ashby verified**
- Output: `data/verified-boards.json` (slug, company name, live job count)
- The registry seeds the top 20 per platform; the rest is there to paste into a source config.

Each adapter caps a single board at 40 recent roles (`maxPerBoard`), because one employer with
2,598 openings would otherwise bury every other company.

## Prospecting instead of waiting: businesses with no website

The job boards are mostly employer-side and heavily US-weighted. The answer to "sell ourselves" is the
opposite direction: find businesses that exist and have no web presence, then approach them.

`osm` adapter — OpenStreetMap Overpass API (free, keyless, global, ODbL attribution required):

- Query: named POIs of chosen types inside a bounding box with **no** `website` and no `contact:website` tag.
- Verified output: `Sultans Pizza & Fast Food — restaurant, no website listed | Ribadu Road, Lagos`.
- A larger Accra/Lagos box returned **60 prospects in one call**; the default box is now a small Lagos
  district because dense areas time out on the volunteer-run servers.
- These are **prospects, not requests**. Each row says "observation from public map data, not a request for
  work", carries `emerging`, and is dated in its external id because a business can add a site tomorrow.
- Overpass mirrors are tried in order; the main instance regularly answers 502 under load.

### Named sites, checked

| Site | Verdict |
| --- | --- |
| We Work Remotely | **wired** (RSS) |
| Remote OK | **wired** (JSON, attribution required) |
| Arc.dev | HTML/JS app, no public API; job details need an account |
| FlexJobs | paid subscription; `robots.txt` disallows `/admin/` and account paths — no public listings |
| JustJoin.it | `/api/offers` → 404 (endpoint moved) |
| No Fluff Jobs | 405 to GET (POST-only), still open to a POST implementation |
| Instagram (remote-work pages) | Instagram's API requires an authenticated business account; scraping is against ToS |

### AI-lab work platforms (Outlier, DataAnnotation, Mercor, Alignerr, Appen, Remotasks)

None publish an open job API — they are application-gated accounts. They cannot be discovered automatically
and should be tracked as manual applications in the Leads board, not scraped.

## Gig / contract sources — probed 2026-11-18

Run with `node scripts/probe-gig-sources.mjs` (46 endpoints) and two follow-up passes for volume and
field shapes. Every row below is a live request made that day.

### Adopted

| Source | Endpoint | What it is | Measured |
| --- | --- | --- | --- |
| We Work Remotely (contract) | `weworkremotely.com/remote-jobs.rss` | Main feed, filtered by the feed's own `<type>` element (Contract / Freelance / Temporary) | 100 items, 15 contract |
| Superteam Earn | `earn.superteam.fun/api/listings/` | Public bounties and projects with sponsor, reward token and deadline; every listing page resolved 200 | 12 open |
| Bugcrowd programmes | `bugcrowd.com/engagements.json?page=N` | **Disabled 2026-11-18.** Open bounty programmes paying per accepted report are security work, not contract work: every row scored 16/100, the `org` field carries Bugcrowd's industry label rather than the sponsor, and no row states a publish date, a deadline or a scope. Adapter kept, source switched off, its 48 stored rows removed | 24 per page, 296 total |
| Freelancer.com (existing) | `api/projects/0.1/projects/active/?limit=&offset=` | Paged; `limit=100` and a real `offset` both work. A short page no longer ends the scan (the API returns 99 of 100 routinely) | 4,285 active; newest 500 read per scan |
| Braintrust (existing) | `app.usebraintrust.com/api/jobs/` | Now reads the whole public list instead of the first 60 | 136 rows |

Selection rule: keyless, no login, robots/terms allow the listed path, and the gig classification comes from
the source's own declared employment type (or the source being a gig marketplace) — never from reading a
title and guessing.

### Refused or unusable (same day)

| Source | Result | Why |
| --- | --- | --- |
| Upwork | RSS 403, API 403 | Cloudflare wall; no public read path, and its terms forbid scraping |
| Fiverr | 403 | Blocks automated access |
| Guru | 403 | Blocks automated access |
| Workana | 403 | Blocks automated access |
| Malt | 403 | Blocks automated access |
| Truelancer | 403 | Blocks automated access |
| freelance.de | 403 | Blocks automated access |
| PeoplePerHour | 404 (`API Endpoint Not Found`) | No public API |
| Freelancermap | 404 on `/rss`, `/rss.xml` and `/api/projects` | No public feed or API |
| Freelancehunt | 404 | Feed path gone |
| Twine | 404 on API and RSS | No public API |
| Contra | 404 (`Route GET:/v1/opportunities not found`) | No public listings route |
| Arc.dev | 404 | HTML app only; jobs need an account |
| Gun.io | 404 | No public API |
| DesignCrowd / 99designs | 404 | No public feed |
| Dribbble jobs | 200, 53 feed items | No employment-type field, so a row cannot be called a contract without guessing; not wired |
| Algora | 404 / 406 | Bounties are app-only; no public listing API |
| DoraHacks | 405 to GET | API rejects GET |
| IssueHunt | 200 but HTML | `api/v1/issues` serves the app shell, not JSON |
| HackerOne | 401 `No credentials were provided` | Programs API needs an authenticated researcher account |
| Gitcoin | fetch failed | Service no longer answers; bounties product retired |
| Remote3 / LaborX | 404 | No public API |
| We Work Remotely contract category | 301 with no location, `/contract.rss` 403 | The category feed is gone; the main feed's `<type>` tag is the working path |
| Freelancer.com contests | 400 on every documented parameter set | Contests endpoint unusable as documented; projects endpoint is the working one |
| NoDesk / Remote.co contract | 404 / 403 | Not reachable |
| Jobspresso, Authentic Jobs | 200 | Jobspresso ignores its `job_type` filter; Authentic Jobs' feed now carries blog posts, not roles |
| Himalayas, Jobicy, Remotive employment-type filters | 200 but unfiltered | The query parameter is ignored; filtering client-side would only re-label rows the feed already owns |

### Per-row work type

The job feeds already wired declare contract rows of their own — Jobicy `jobType` was 24/100 Contract on
2026-11-18, Remotive `job_type` 5/16 contract or freelance, Himalayas `employmentType` Contractor on
1/20. Each of those adapters now reads that field for the row it belongs to, and the ingest path stores
`opportunities.work_type = 'gig'` only for the tokens the feed actually prints: contract, contractor,
freelance, temporary. The column stays NULL otherwise, so no row becomes a gig on the strength of its
title or description, and a full-time row in the same feed stays salaried.

The gig view includes `work_type = 'gig'` rows, the salaried view excludes them, and such a row is marked
`CONTRACT` rather than `JOB`. Rows stored before the column existed are not rewritten by the migration;
the next scan of those feeds sets the work type on every row the feed still returns, because a duplicate
whose feed positively declares contract work gets its stored work type updated.

### What the rule scorer reads

The scorer reads the posting and its own title, never a sentence an adapter wrote. Three
adapters compose the body themselves: Bugcrowd adds “this is not a salary or a fixed
contract”, Superteam adds how the sponsor pays, and DataAnnotation explains its
application gate. Those sentences are kept for the reader, but the adapters also supply
`scoringText` — the source's own words, which for Superteam and DataAnnotation is empty
because the endpoints publish no description. `opportunities.scoring_text` stores that
division (NULL when the body is entirely the source's), ingest scores against it, and a
re-score reads it too, so a profile save cannot reintroduce the old signal.

The measured false positive this fixed: every Bugcrowd row scored 16/100 with the
rationale “explicit demand language: “salary””, on a programme paying bounties, because
the word appeared in our disclaimer.

Braintrust was the second adapter with this fault: its body is our summary of the
platform's fields, and the sentence “Engagement: freelance.” tripped the “freelance”
demand signal on **129 of 136 rows**. It publishes no description, so its scoring text is
now the platform's own `main_skills` list; the employer, engagement, budget, hours,
timezones and location stay in the body for the reader. Demand words that appear in a
source's *title* still count — that text is the source's. OSM prospect rows are scored by their
gap tags, not their text. Every other adapter passes the source's text through unchanged.

Arbeitnow's `job_types` array mixes seniority with the contract form (`["Experienced","contract"]`,
`["Contract"]`, `["Experienced","freelance"]`), so its contract tokens feed the same per-row work type.
It adds no request and no row: the rows were already being stored, they were simply counted as salaried.

### How deep Freelancer.com is paged, and why

Measured 2026-11-18: the active-projects endpoint reports `total_count` 4,285, and offsets past 3,000
still answer, so the ceiling is the board, not the API. Depth is bounded on purpose. In the newest 500
projects, 48 % match development work by title or skill tag, the median budget minimum is $250, and only
28 % are both development and at least $100. That window reaches back about three days; past it, an
active project is usually a lead that has already gone unanswered for a week. Paging the whole board
would store about 4,300 rows at roughly 2.6 writes each — around 11,000 writes, more than the
deployment's entire daily D1 allowance of 10,000 rows.

The adapter now reads 100 per page for 5 pages: the newest 500, up from 150. The first sweep after the
change costs roughly 900 writes; afterwards only genuinely new postings cost anything, of the order of a
few hundred writes a day. Writes per inserted row are measured from this workspace, not assumed: one
`opportunities` row, one `activities` row, and the matched skills (0.56 per row on average locally).

Jobicy's `count` was left at 50. Doubling it to 100 adds about 12 contract rows against 50 extra
salaried ones, which widens the imbalance in the wrong direction for the mark it costs.
