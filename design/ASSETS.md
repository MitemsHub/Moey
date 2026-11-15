# Asset plan

## Decision: no photographic or illustrative assets

This product makes claims about real organisations and real work. A stock photograph or a generated illustration in
this interface would either be decorative noise in a data-dense tool, or — worse — read as evidence of a client
relationship that does not exist. Neither is acceptable.

Source identity is therefore carried by **text and monograms only**: the source label in the table, and the adapter
name in the provenance rail. No logos are used, because using a company's logo to indicate "we read their public job
board" would imply a relationship that does not exist.

| Section | Visual needed | Source | Status | Licence |
| --- | --- | --- | --- | --- |
| Shell / rail | Wordmark "M" block | Drawn in markup | Done | Original |
| Sign-in panel | Provenance diagram | Rendered from the same components | Done | Original |
| Health strip | Status dots | CSS | Done | n/a |
| Opportunity rows | Source label, provenance ticks | CSS/SVG | Done | Original |
| Detail page | Provenance rail | CSS/SVG | Done | Original |
| Empty states | Line icon (lucide) | `lucide-react` | Done | ISC |
| Favicon | "M" glyph | `public/favicon.svg` | Done | Original |

## Assets only the operator can supply

These are content, not files, and the interface treats them as missing until entered:

1. **Profile facts** — real skills, real services, real evidence of delivered work. The profiles ship empty and the
   UI says so on the overview, on the profile itself, and in the score rationale.
2. **Eligibility facts** — right to work, entity name, tax id, insurance. Blank by default; scores carry an explicit
   warning until they are filled.
3. **The ATS board list** — real company board tokens. Seeded with a small starter set that is labelled as examples
   of the shape, not as endorsement or partnership.

## Slop test

Could this belong to any company with the logo swapped? No — the provenance rail and the "source terms" block are
specific to a product whose value is attributable evidence. Is there something memorable? Yes: the rail, and the
honest empty states. Would a senior designer ship it unchanged? The table and rail, yes; the leads board is the most
conventional surface and is the first candidate for a redesign once real usage exists.
