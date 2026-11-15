# References — teardown

Mode 1 (Original) uses references for **principles only**. No layout, palette, copy or component is reproduced.
Values below are labelled **observed** (from the product as used) or **inferred** (from how it reads, not measured).

## 1. Linear — issue list

- **Observed:** rows are a fixed height with a single primary line and a secondary metadata line; the row never
  wraps into a paragraph. Hover is a flat tint, not a shadow lift. Status is a coloured glyph or dot, never text
  colour on the whole row.
- **Observed:** keyboard-first — a command palette is the primary navigation, and shortcuts are discoverable without
  a help screen.
- **Principle taken:** *one idea per row, secondary facts compressed into a single metadata line.*
- **Adapted as:** the opportunity table — title on line one; organisation, remote flag and compensation on line two;
  status carried by the kind column rather than colouring the title.
- **Risk avoided:** Linear's density assumes a trained user on a large screen. Mitigated by keeping the table
  horizontally scrollable at a 860px minimum rather than compressing to unreadable columns on mobile.

## 2. Bloomberg terminal layouts

- **Observed:** figures are monospaced and right-aligned so columns can be compared by eye; labels are small and
  uppercase; hue marks a *status channel*, not decoration.
- **Inferred:** the interface assumes the operator scans for exceptions rather than reading each record.
- **Principle taken:** *numbers get the mono face and tabular figures; colour is reserved for meaning.*
- **Adapted as:** `--font-mono: JetBrains Mono` applied through a single `tnum` utility; only `--success` (verified)
  and `--warning` (emerging) carry hue.
- **Risk avoided:** the terminal look is forbidding and can imply authority the data does not have. Mitigated by
  never colouring a score green unless it is actually ≥ 60, and by showing "not stated" instead of a blank.

## 3. Stripe Dashboard — payment tables

- **Observed:** a row summarises a long record; drilling in keeps the surrounding list in place rather than replacing
  the page. Status transitions are explicit and recorded.
- **Principle taken:** *a record should be able to explain its own history.*
- **Adapted as:** the decision log on the detail page, and the provenance rail, both derived from stored rows only.
- **Risk avoided:** Stripe's airy row height suits 10 rows, not 40. Mitigated by a 2.5-unit vertical rhythm instead.

## 4. Readwise Reader — feed surfaces

- **Observed:** new versus seen is indicated by weight and a small marker, not by a badge for every item; the feed
  keeps position when you return.
- **Principle taken:** *a feed must be triageable without losing your place.*
- **Adapted as:** the "Latest arrivals" rail with a source label and relative timestamp per item, independent of the
  main table so scanning one never disturbs the other.

## What was deliberately not taken

Ambient animation loops, gradient accents, illustrated empty states, avatar clusters, and any marketing hero pattern.
The product has no marketing surface, and the brief's users want density, not delight.
