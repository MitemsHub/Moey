# MITEMS Studio OS — index for this project

Source: local clone at `~/mitems-studio-os`, copied to `design/mitems-studio-os/` (62 files: 60 chapters + README +
references). Read from the copy so the project is self-contained.

## Chapters applied to this milestone

| Chapter | Purpose | How it was used here |
| --- | --- | --- |
| `00-CONSTITUTION.md` | Highest authority: Articles I–XII, quality hierarchy, the floor | Drove the trade-offs below |
| `04-DESIGN_PHILOSOPHY.md` | Why decisions are made the way they are | Restraint: one signature component |
| `16-DASHBOARD_DESIGN.md` | Dashboard density, hierarchy, scanning | Row rhythm, KPI strip, table density |
| `18-SAAS_DESIGN.md` | Product-surface patterns | Empty/loading/error states, settings |
| `37-SECURITY.md` | Secrets, auth, input validation | Owner scoping, ingest bearer, clamps |
| `38-AUTHENTICATION.md` | Session and identity handling | Reused the scaffold's Freebuff integration |
| `39-DATABASE_DESIGN.md` | Entity modelling | Two pipelines as a column, not two tables |
| `55-DATA_VISUALISATION.md` | Honest charts and figures | No chart where a number would do; tabular figures |

## Articles that decided specific trade-offs

| Article | Decision |
| --- | --- |
| **II — Quality hierarchy** | Search uses a slower `LIKE` than a speculative FTS5 setup, because a runtime failure outranks query speed. |
| **III — Non-negotiable floor** | The ingest endpoint fails **closed** (503) when `INGEST_SECRET` is unset rather than accepting unauthenticated writes. |
| **IV — Systems over artifacts** | Every opportunity goes through one `ingest()` path, so seven adapters cannot drift into seven behaviours. |
| **V — Consistency over novelty** | Tokens and the existing primitives were reused; only values changed. |
| **VI — Explainable** | Every score stores `model` and `rationale`; the UI prints which produced it. |
| **VIII — Simplicity** | Three agents, not eleven. Crawlee/Playwright/LangChain rejected while unused (see `docs/COMPONENTS.md`). |
| **IX — Small reversible steps** | Schema is additive-only; FTS5 deferred rather than guessed. |
| **XII — Break rules loudly** | Where a SHOULD was not met (no FTS5, no vector search), it is recorded in the brief's decision log and here. |

## Not read this milestone

Chapters 19, 47, 56–60 (ecommerce, deployment, i18n, email, resilience, incidents, ethics) were not needed for
this scope. They will be read before any billing, email or public-launch work.
