<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0010. The minimum panel is a guideline with a recorded reason, not a gate

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner (adopt the Nictiz minimum panel, not too strict), maintainer (design)

## Context and problem statement

The Nictiz zib management agreements set a minimum number of clinical,
terminology and architecture experts per change class A to D
([Beheerafspraken zib's V1.0](https://www.zibs.nl/images/7/7a/Beheerafspraken_zorginformatiebouwstenen_V1.0.pdf),
section "Analyseren/in analyse"). The owner wants cdm-plenum to use this
minimum for rating rounds (DE11), without making it too strict: the first
users are teaching and research groups, which may not have an architect or a
terminologist at hand.

## Considered options

1. A hard gate: a round cannot open below the minimum.
2. A guideline: the round setup shows the shortfall, and opening below the
   minimum asks for a reason that is stored and reported.
3. Information only: show the panel, no reason asked.

## Decision outcome

Option 2. The shortfall stays visible and explained in the decision report
(EX3), which is what a reader of the result needs, while a small group can
still run a round. Option 3 loses the explanation; option 1 blocks the
teaching use.

- The class defaults come from the agreements' minimum, not their larger
  guideline panel.
- The panel and the minimum are stored on the round when it opens.
- A facilitator can adjust the counts per project (DE13, Could).

### Consequences

- Good: the tool nudges toward a complete panel without refusing work.
- Bad: a round can still run with an expert type missing; the report has to
  make that clear (R-08).
- The agreements' later versions (V1.2, V1.3) were not checked; if they change
  the counts, the defaults in `src/lib/panel.ts` and the requirements table
  change together.
