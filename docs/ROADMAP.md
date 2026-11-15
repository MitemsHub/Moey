# Roadmap after M1

M1 shipped the engine: discovery, dedupe, rules scoring, provenance, both pipelines, five screens. What follows is
ordered by "what actually makes the product useful to its owner", not by what is interesting to build.

## M1.1 — Make the numbers mean something (prerequisite, not optional)

| Step | Why it gates everything else |
| --- | --- |
| Enable the model qualifier (`OPENAI_API_KEY` as a Sites secret) | Rules cannot read non-English tender text, so the business pipeline scores ~0. Nothing else matters until that is fixed. |
| Enter the real profile facts (skills, services, eligibility) | Placeholder skills produce placeholder scores. |
| Measure one real discovery run | All cost figures so far are estimates. |

Exit criteria: at least one business lead and one individual opportunity score above 60 with a rationale a human
agrees with.

## M2 — Coverage and control

- Curate the ATS board list (the real work behind "discovery"): 40–80 employers, verified by hand, stored as
  source config.
- Turn on the GitHub Actions cron and watch it for a week of unattended runs.
- Deploy to Freebuff Sites; exercise sign-in and per-owner isolation under `workerd`.
- Review queue: promote/dismiss decisions with a reason, feeding back into scoring weights.

## M3 — The application layer

- Application and proposal drafts generated from a real opportunity plus real profile facts, always reviewed
  before anything leaves the system. Still no auto-submit.
- Client communication and delivery tracking for won business leads.
- Billing/invoicing — last, because it depends on everything above being trustworthy.

## Deliberately not planned

Social-platform discovery (Reddit, LinkedIn, Meta, TikTok) stays refused on legal grounds, not deferred on
effort. Any future opt-in requires a documented permission path first, per `docs/SOURCES.md`.
