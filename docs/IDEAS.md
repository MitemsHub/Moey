# Follow-up ideas, ranked by value

Nothing here is started. Ranked by "what makes this useful to its owner soonest", not by novelty.
Effort is my estimate: S ≈ a day, M ≈ a few days, L ≈ a week or more.

### 1. Decision feedback loop (S) — the single highest-value change
Every promote/dismiss already exists as a status change. Record *why* (a short reason list: wrong
seniority, wrong stack, not remote, agency, too old) and use those reasons to adjust scoring weights per
pipeline. **Why:** the current score is a generic guess; the only person who knows what "fit" means here is
the operator. Ten decisions teach the engine more than any prompt tuning. It also makes every later
automation (digests, drafts) defensible.

### 2. Re-post detection across time (S) — nobody has mentioned this
Today dedupe answers "is this the same job from two boards?". It never answers "has this role been
re-advertised five times since March?". A role that keeps reappearing is either persistent demand (good lead)
or a hard-to-fill role the employer may have repriced. Store first-seen/last-seen per canonical role and
surface `reposted ×3 over 6 weeks`. **Why:** with ~4,000 live rows the interesting signal is repetition, not
volume, and it costs almost nothing to compute.

### 3. Novelty-first feed instead of a ranked pile (S)
Show what is new since *your* last visit and default the table to that. Keep "everything" behind a filter.
**Why:** a 4,000-row table is a database, not a decision surface. The product's promise is "tell me what
changed", and right now it tells you what exists.

### 4. Snapshot the evidence at ingest (M)
Store the posting text, title and a timestamp as the listing was when first seen. **Why:** links rot. When a
row says "verified listing" and the URL 404s, provenance is gone — and provenance is the whole product. It
also enables "the description was edited after you saved it", which matters for tender deadlines.

### 5. CPV-to-service mapping for tenders (M)
EU TED gives a CPV code (`72…` = IT services) even when the text is in Czech. Map a small CPV subtree to the
business profile's services. **Why:** it fixes the business pipeline's near-zero scores *without* a model,
and it is deterministic evidence rather than a guess.

### 6. Cost meter and hard budget cap for the model (S)
Per-run token/spend estimate, visible in Settings, with a monthly ceiling that stops calls when hit.
**Why:** an unattended cron with someone's API key is how a small project gets an unpleasant bill. The gate
(score ≥ 35) limits volume today; a cap makes it safe to leave running.

### 7. Dead-listing sweep (S)
Periodically re-check a sample of source URLs; mark closed/404 rows and exclude them from "awaiting review".
**Why:** a review queue full of dead jobs trains the operator to ignore the queue.

### 8. Source scoring by outcome, not volume (M)
Track which source produced rows that became leads or applications. Rank sources by that, not by count.
**Why:** Jobicy's 50 rows and Greenhouse's 2,800 are not equally valuable; giving each source a conversion
number tells you where to spend attention and API budget.

### 9. Board-token discovery (M)
The ATS adapters are only as good as the curated employer list. A small crawler that reads a company's
careers page and recognises "this is Greenhouse/Lever/Ashby" turns list curation into a one-command task.
**Why:** it is the actual bottleneck to ATS coverage, and it is mechanical, not judgement.

### 10. Cross-pipeline suggestion (M) — nobody has mentioned this
When a business lead's industry matches the individual profile's demonstrated skills, suggest the service
that could be offered (with the evidence, never auto-generated claims). **Why:** the two pipelines currently
never speak; the interesting output is "this tender needs exactly what you can do", which is a lead and a
positioning line at once.

### 11. Digest by email (S)
A daily or weekly summary of new high-fit rows and closing deadlines. **Why:** it is the difference between a
dashboard you must remember to open and one that pulls you in. Needs an email provider and a scheduled send
(the runner already exists).

### 12. Saved searches (S)
Named filters (e.g. "EU tenders, software, deadline < 21 days") that run as their own queue and can feed the
digest. **Why:** the operator's interests are stable and narrow; re-applying filters by hand every visit is
the most repeated work in the current UI.

### 13. Salary/comp normalisation (M)
Parse the stated range into one comparable annual figure with currency and period. **Why:** "compensation
stated" is currently a +4 honesty bonus; a comparable number would make it a real sort key. Only worth doing
once enough rows carry pay.

### 14. Agency/aggregator clustering (M)
Detect postings that are agency restatements of one employer and collapse them. **Why:** reposters inflate
counts and hide the actual hiring organisation, which is who you would contact.

### 15. Public read-only share view (M)
A signed, expiring link to one opportunity with its provenance chain. **Why:** when discussing a lead with a
partner or a client, the provenance rail is the argument. It also makes the product demonstrable without
screenshots.

## What I would do first

Items 1, 2 and 3 — all small, all on the same data, and together they turn a ranked list into a working
decision tool. Item 5 next, because it attacks the one number that is currently misleading (business scores
stuck at 0 for reasons that have nothing to do with relevance).
