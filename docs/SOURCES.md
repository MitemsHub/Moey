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
