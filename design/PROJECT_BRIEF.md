# PROJECT BRIEF (approved: yes, 2026-11-14)

**Product:** Mitemshub Opportunity Engine — an internal intelligence product that finds, verifies, scores and tracks
commercial and personal opportunities from open web sources.
**Audience:** the Mitemshub operator (single workspace), working two separate books of business.
**Goal:** turn published *demand* into a reviewed, source-attributed pipeline — without fabricating anything.

## Stack and constraints

- Vite 8 + React 19 + TanStack Query, Tailwind v4 tokens.
- Hono Worker on Freebuff Sites, D1 (`DB`) for data, Sign in with Freebuff for accounts.
- Discovery runs as an adapter set inside the Worker *and* from a GitHub Actions cron (6-hourly) that POSTs
  pre-normalised items to an authenticated ingest endpoint. Workers cron/queue bindings are not exposed by the
  Sites manifest, so scheduling lives outside the Worker.
- No secrets in source. `OPENAI_API_KEY` is optional; without it the qualifier is rules-only and says so.

## Mode

Mode: **Original** (mode 1) · Surface: **Code-first**

No reference site is reproduced. References inform principles only: information density, provenance display,
number hierarchy. Nothing from the CRM template's identity survives — no contacts/deals vocabulary, no purple,
no sample people, no copy.

## What the user loves / said (their words)

> "The interface should feel like a serious commercial intelligence product, not a generic AI dashboard."
> "Avoid unnecessary gradients, glassmorphism, neon effects and decorative interface elements."
> "Prioritise information hierarchy, clarity, useful data visualisation and excellent usability."
> "Do not create fake data that could be mistaken for real opportunities."

## References chosen (principles only — no URL is replicated)

| Reference                          | Why                                                                 | What to study                                                | Risk                                        |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------- |
| Linear (issue list)                | Dense rows that stay scannable; keyboard-first; restrained chrome    | Row rhythm, hover restraint, priority as a single glyph       | Density can crowd mobile                    |
| Bloomberg / terminal layouts       | Numbers carry the hierarchy; colour is a status channel, not decor   | Tabular figures, label/value contrast, status as colour only  | Can feel forbidding to a non-specialist     |
| Stripe Dashboard (payments tables) | Provenance chains and clear status transitions in a table            | How a row summarises a long record                            | Too airy for 40-row scanning                |
| Readwise / Reader (feed surfaces)  | A stream you can triage fast without losing position                 | New-vs-seen treatment, unread affordance                      | Feed can compete with the main table        |

## Design direction

**Thesis:** the product's real asset is *provenance* — every row can be traced to the sentence that produced it.
The interface should read like an evidence ledger, not a dashboard.

- **Hierarchy:** 1) what arrived since you last looked, 2) how well it fits which profile, 3) where it came from.
- **Type:** Newsreader (display, serif, editorial) for headings and the big numerals; Inter for UI; JetBrains Mono
  for ids, timestamps, source keys and all tabular figures.
- **Palette (committed, roles fixed):** warm bone `#EFEBE2` page, paper `#F8F6F1` surface, warm ink `#16150F` text,
  brick `#8A3324` as the single interactive accent, pine `#1E4D3F` **verified**, ochre `#9A6A12` **emerging**.
  Colour is a status channel only — never decoration.
- **Layout:** fixed left rail, a source-health strip that is always visible, then a two-pane work area: the
  **signal feed** (signature component) at 300px and the working table beside it.
- **Signature moment:** the **provenance rail** — an inline chain `source → fetched → normalised → qualified →
  decision` rendered as ticks on a hairline, present on the detail view and echoed as a 3-tick glyph in rows.
  It exists to answer "why should I believe this?" in under a second.
- **Imagery:** none. No stock photography, no avatars of invented people, no illustrations. Source identity is
  carried by a monogram sigil per adapter. This is honest and removes a whole class of fake-asset risk.
- **Motion:** 120–200ms, `cubic-bezier(.2,.8,.2,1)`; entrance for feed items only; no ambient loops. All
  motion disabled under `prefers-reduced-motion`.

## Component plan (approved)

| Area        | Choice                                                         | Reason                                                     |
| ----------- | -------------------------------------------------------------- | ---------------------------------------------------------- |
| Header      | Minimal bar + persistent **source-health strip**               | Health is the one thing that silently destroys trust if it rots |
| Hero        | None — this is an app, the feed is the entry point              | No marketing surface exists                               |
| Proof       | Per-row provenance ticks + detail rail                          | The product's claim is traceability                        |
| Main        | Dense opportunity table (sort/filter/search) + triage feed      | Two working modes: scan everything vs. triage what is new   |
| Sections    | Source registry, profile/skills, leads board, review queue      | Each is a distinct job                                    |
| Footer      | None in-app; a settings/status block instead                    | No legal or marketing footer inside a tool                 |

One signature component per page rule respected: the provenance rail is the only "designed" element; everything
else is quiet.

## Asset plan

No photographic or illustrative assets are required or used. `design/ASSETS.md` records this and lists the two
assets only the user can supply (real profile facts, real source enablement).

## Constraints carried from the source documents

- Never fabricate qualifications, employers, clients, testimonials or statistics.
- Never present an emerging signal as a verified opportunity.
- Never auto-submit an application, accept a contract, agree a price or make a financial commitment.
- Every opportunity keeps its original source URL and the decision log that produced its score.
- Respect each source's terms; a source that cannot be used legally is refused, not worked around.

## Missing assets / open questions

1. Real facts for the individual profile (skills, eligibility, availability) and the business profile
   (service catalogue, evidence of past delivery). Until supplied, the profile screens say they are unfilled and
   scoring leans on generic skill extraction only.
2. Whether the operator is under 18 / whether a registered entity exists — gates which opportunities are even
   actionable. Modelled generically; nothing is inferred.
3. Company list for ATS discovery (board tokens). Seeded with a small, clearly-labelled starter set.

## Status checklist

Status as of the M1 audit (`docs/AUDIT.md`). `✓` built and checked · `◐` renders correctly but was only
verified in the DOM, not reviewed visually · `—` not done.

| Section            | L1 | L2 | L3 | L4 | L5 | Inspected | Drift-checked |
| ------------------ | -- | -- | -- | -- | -- | --------- | ------------- |
| Shell / rail       | ✓  | ✓  | ✓  | ✓  | ✓  | ✓         | ✓             |
| Health strip       | ✓  | ✓  | ✓  | ✓  | ✓  | ✓         | ✓             |
| Signal feed        | ✓  | ✓  | ✓  | ✓  | ✓  | ✓         | ✓             |
| Opportunity table  | ✓  | ✓  | ✓  | ✓  | ✓  | ✓         | ✓             |
| Opportunity detail | ✓  | ✓  | ✓  | ✓  | ✓  | ✓         | ✓             |
| Sources registry   | ✓  | ✓  | ✓  | ✓  | ✓  | ◐         | ◐             |
| Leads board        | ✓  | ✓  | ✓  | ✓  | ✓  | ◐         | ◐             |
| Profiles           | ✓  | ✓  | ✓  | ✓  | ✓  | ◐         | ◐             |
| Settings           | ✓  | ✓  | ✓  | ✓  | ✓  | ◐         | ◐             |

Mobile (390 px) was checked on the opportunity table only: Source and Seen columns are hidden below `sm`, the
table fits at 379 px with no horizontal scroll, and the document no longer reports stray horizontal overflow.
The other four sections were confirmed to render at 390 px but were not visually reviewed there.

Open at the end of M1, stated rather than implied: the business pipeline scores ~0 in rules-only mode because
TED notices are often non-English; the model qualifier is not enabled (no key, no model call was ever made);
High fit (≥60) is therefore unreachable; four sources ship disabled pending a board list or key; and nothing
has been deployed.

## Decision log

| Date       | Change                                                                 | Reason                                                                                     |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 2026-11-14 | Use CRM template purely as scaffolding; delete its domain and identity  | Saves auth/D1/R2/query plumbing; keeps zero inherited design                                |
| 2026-11-14 | npm instead of bun                                                     | bun is not installed on this machine; converting the test runner to vitest is cheaper        |
| 2026-11-14 | Colour used only as status; brick as the single accent                 | Two status colours must stay unambiguous; a decorative accent would compete with them        |
| 2026-11-14 | Any number of `emerging` items must never enter the leads board         | Board implies commitment; signals are unverified by definition                              |
| 2026-11-14 | FTS5 deferred; LIKE search with indexes used instead                    | D1 support for virtual tables is not verifiable from this machine; LIKE is adequate at MVP scale |
