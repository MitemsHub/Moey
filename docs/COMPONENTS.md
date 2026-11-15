# Component evaluation register

Statuses: **Discovered** → **Under evaluation** → **Tested** → **Adopted** / **Rejected**.
`moey.md` §4 requires that nothing be installed blindly, so every row states what it contributes, whether an
existing capability already covers it, licence, maintenance and cost.

## Reused (already present in the workspace)

| Component | Contributes | Licence | Maintenance | Status | Why |
| --- | --- | --- | --- | --- | --- |
| Freebuff Sites (Workers + D1 + R2) | hosting, DB, files, auth | platform | current | **Adopted** | Deployable today; one auth system; no second platform to operate |
| `@freebuff/auth` | OIDC sessions, same-origin checks | platform | current | **Adopted** | Already wired by the scaffold; no credential handling of our own |
| Hono | HTTP routing in the Worker | MIT | active | **Adopted** | Tiny, Workers-native |
| TanStack Query | client cache/invalidation | MIT | active | **Adopted** | Already the scaffold's data layer; avoids hand-rolled caching |
| Tailwind v4 + CSS tokens | styling | MIT | active | **Adopted** | Tokens in one file, per AGENTS.md §7.5 |

## Evaluated this cycle

| Component | Contributes | Licence | Deps / cost | Status | Reasoning |
| --- | --- | --- | --- | --- | --- |
| **Crawlee** (apify) | crawling, session rotation, Playwright fallback | Apache-2.0 | Node only, free | **Under evaluation** | Right tool *if* a JS-heavy source needs it. Adopted adapters are all JSON, so adding it now is speculative generality (Constitution Art. VIII). Keep as the answer for browser-bound sources in M2. |
| **Playwright** | browser automation for paginated/JS pages | Apache-2.0 | ~100MB browser download | **Deferred** | Same reason. Available via the GitHub Actions runner when needed, not shipped to the Worker. |
| **Firecrawl** | scrape→markdown API, handles anti-bot | AGPL-3.0 | hosted from $16/mo | **Rejected (for now)** | AGPL is viral over a network service; the hosted tier is a recurring cost for a problem we do not yet have. Revisit only if a specific source resists plain fetch. |
| **`jobspipe/ats-job-apis`** | documented ATS endpoint shapes and gotchas | reference only | none | **Tested (as reference)** | Confirmed the endpoint set and the per-employer constraint. No code taken. |
| **`elliottdehn/open-jobs`** | `slugs.json` company→ATS board map; crawler design | CC0-1.0 | none | **Under evaluation** | The project shut down 10 Oct 2026 because crawling 3M jobs cost more than it could carry — a direct warning about scope. Its CC0 slug list is a plausible seed for our curated board list. Not copied in M1: stale since Oct 2026 and unverified. |
| **Adzuna API** | broad job coverage | proprietary | free key, **14-day commercial trial** | **Rejected** | Commercial use after the trial needs a licence agreement. Shipping it would build a dependency we cannot keep legally. |
| **Remotive / RemoteOK / Arbeitnow / Himalayas** | extra remote feeds | proprietary feeds | free, attribution | **Deferred** | Keyless and usable, but each demands a link back and low poll rates, and several forbid republishing as job listings. Jobicy already covers this need with explicit commercial permission. Add only if coverage proves thin. |
| **TED API** | EU public procurement notices | EU reuse policy | free, no key | **Adopted** | Free reuse, documented, ~700 req/min fair use. Best signal quality per request in the whole set. |
| **SAM.gov API** | US federal opportunities | public API terms | free key, daily caps | **Ready** | Adapter written; needs a key stored as a secret. |
| **Reddit / LinkedIn / Meta / TikTok** | "social discovery" | — | — | **Rejected** | Terms forbid the use; see `docs/SOURCES.md` for the evidence per platform. |
| **Supabase** | Postgres, pgvector, RLS, auth | Apache-2.0 | free tier pauses; $25/mo Pro | **Deferred** | The documented escape hatch. Adopt only when vector matching or heavy SQL analytics genuinely requires it — it would double the auth model for no M1 benefit. |
| **shadcn/ui** | component primitives | MIT | none | **Rejected** | The scaffold's own primitives are already tokens-based and coherent; adding a second component language would fracture the system. |

## Agents and frameworks

| Candidate | Status | Reasoning |
| --- | --- | --- |
| LangChain / LlamaIndex style orchestration | **Rejected** | Three agents with fixed I/O shapes need a function call and a database row, not a graph runtime. |
| Multi-agent frameworks (CrewAI, AutoGen) | **Rejected** | Would add a dependency, a failure mode and an eval problem for benefit we cannot measure at this scale. |
| Direct model call (OpenAI-compatible via Freebuff) | **Adopted** | One `fetch` to a chat-completions endpoint, with the key server-side. Observable, cheap, replaceable. |

## What must never be added without a decision

A second auth system, a vector database, a queue provider, or a browser runtime inside the Worker. Each has a
named trigger in `docs/ARCHITECTURE.md` §8 that would justify it; until that trigger fires, adding it is cost
without a requirement.
