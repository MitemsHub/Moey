# AI-lab work platforms — register

Researched 2026-11-15. These pay for expert work that trains or evaluates AI models: exactly the kind of
contract work this engine should surface. None of them expose a job API in the way the ATS boards do, so this
file is the register of what exists and what it would take to wire each one.

## Why they are not a normal adapter

| Platform | Run by | Payout | Entry | Live listings | Ingestable today? |
| --- | --- | --- | --- | --- | --- |
| **Mercor** | Mercor (US) | Weekly, Stripe/Wise | Application → AI interview → ID check | ~1,500–2,000 open roles, median ~$78/h | Page is a Next.js app with an embedded data payload (verified 200, `__NEXT_DATA__`) — parseable, but requires a ToS review and a fragile parser |
| **DataAnnotation** | Surge Labs | PayPal, days after request | Starter assessment (~1h, no retakes) → ID check | 133 public roles; $25–50/h general, $40–150+/h coding | Publishes a public job board (verified 200, 183 KB HTML) — parseable |
| **Alignerr** | Labelbox | Stripe/PayPal | Resume, persona ID, some assessments | ~356 roles; ~$80/h average | Next.js payload (verified 200) |
| **Outlier** | Scale AI | Weekly, PayPal/Airtm/ACH | Application → assessment → ID | Projects behind login | No public listing |
| **micro1** | micro1 (US) | Deel | Application → AI interview | ~465 roles, ~$65/h median | Application-gated site |
| **Handshake AI** | Handshake | Stripe | Fellowship application | ~341 roles, US-based | US-only, invite-gated |
| **Mindrift** | Toloka | Payoneer/PayPal, biweekly | Application → assessment | ~950 roles, $15–100+/h | Application-gated |
| **CrowdGen** | Appen | Per project | Application | Contributor projects | Application-gated |
| **Remotasks** | Scale AI | Weekly, PayPal/Airtm | Onboarding course | 90+ countries, task-based | No public listing |

Sources: platform pages plus independent comparisons (datapacts.com, aitrainer.work, aiworkcentral.com,
trainearn.ai), all read on 2026-11-15. Pay figures are what each platform or comparison site publishes — not
measured by us, and they change.

## The honest recommendation

1. **Track them as applications, not opportunities.** Every one of these requires an account and a screening
   step; there is nothing to "discover" daily. The Leads board is the right home: one entry per platform with
   the assessment status, so the pipeline reflects reality.
2. **If we do wire any, start with DataAnnotation and Mercor** — both publish listings publicly. Each needs its
   own terms check first, and the parser must be isolated in one adapter that fails loudly when the page shape
   changes.
3. **Do not scrape Outlier or Remotasks** — the work is behind a login, so there is nothing public to fetch.

## What this means for the product

A single `ai-platforms` source that emits, per platform, one "opportunity" of type *application available*
(with the published rate range and the current open-role count) would be honest and useful: it is a
reminder of a channel, not a fabricated job. That is a design decision for the user, not something to add
silently.

## Wired: DataAnnotation (`dataannotation`)

Adapter added 2026-11-15. Source of truth is **the sitemap**, not the job board: `/job-board`
now 301s to the homepage and the role cards are client-rendered, but `sitemap.xml` lists every
role URL (134 on 2026-11-15, against the "133 roles" the site advertises).

- `parseDataAnnotationRoles(xml)` is the whole parser, exported and unit-tested. It keeps
  `/job-board/<slug>` URLs only, dedupes by slug, and **throws** below 10 roles rather than
  returning an empty list, so "the board moved" can never look like "nothing is open".
- Titles come from the slug (`software-engineer` → "Software Engineer", with AI/ML/STEM/QA/SQL
  kept as acronyms). Nothing is fetched per role, so no rate or category is claimed: the body
  says payment is set per role and links to the posting.
- First live run: 134 found, 132 inserted, 2 deduped against existing rows, 0 errors, 18s.

**Known gap:** these listings score ~0 on fit, because fit is built from requirement text and a
role listing is a title. They are visible under Newest and searchable, but sink under Best fit.
Fixing it honestly needs either (a) fetching each role page for its published category and rate
(134 requests per run is above the Workers subrequest budget, so it would have to rotate), or
(b) an explicit role-family taxonomy matched against the profile. Neither is guessed here.
