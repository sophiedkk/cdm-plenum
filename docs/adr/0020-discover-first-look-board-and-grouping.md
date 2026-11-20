<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0020. Discover: a first look at existing models, a question board, grouping by the facilitator

- Status: Proposed
- Date: 2026-11-20
- Deciders: owner (approved the clickable Discover prototype on 2026-11-20,
  chose facilitator grouping after the evidence check, asked for drag and
  drop and for phase recaps), maintainer (design)
- Supersedes: step 3 of [ADR 0012](0012-discover-phase-sources-private-brainstorm-sort.md)
  (the optional participant sort)

## Context and problem statement

After testing v0.2.0 the owner found the Discover phase uninspiring. The
brainstorm was four text fields on an empty page. Participants typed
elements that existing models already have, because the source model import
of [ADR 0016](0016-start-from-existing-models.md) has no pages yet. The phase
steps in the header showed status only, so a participant had no way back to
what an earlier phase produced.

ADR 0012 planned an optional open card sort by participants, to be built after
the evidence was checked. The check found no study showing that a participant
sort before a Delphi reduces items, duplicates or attrition, or raises
consensus:

- **Who groups:** in the COMET Handbook the study team groups the long list
  into domains, two researchers map each item independently, and an advisory
  group reviews the result (Williamson et al. 2017,
  <https://doi.org/10.1186/s13063-017-1978-4>, sections 2.7.1.2 and 2.13.2).
  All 17 core outcome set studies in its Table 3 grouped this way; none used
  a participant sort.
- **What helps:** fewer items. Each 10 extra items lower the Delphi response
  rate by 1.4 percentage points (Gargon et al. 2019,
  <https://doi.org/10.1016/j.jclinepi.2018.12.010>). Merging duplicates
  (EL5, EL16) does that already.
- **What a sort costs:** the order of grouped blocks changed which items
  were kept for 26 to 29% of items (Brookes et al. 2018,
  <https://doi.org/10.1186/s13063-017-2405-6>). In a concept mapping study,
  48% of patients found sorting easy (Mills et al. 2019,
  <https://doi.org/10.1186/s41687-019-0147-9>). An open sort needs about 15
  sorters for stable results (Katsanos et al. 2019,
  <https://doi.org/10.1145/3290607.3312999>), more than most panels have.

## Considered options

1. Keep the Discover page as it is and build the source model import beside it.
2. Discover in four parts, as in the approved prototype
   ([2026-11-20-discover-prototype.html](../evaluations/2026-11-20-discover-prototype.html)):
   start from existing models, a first look by participants, a brainstorm
   board for what is missing, and grouping by the facilitator that
   participants check. Done phase steps open a recap of their phase.
3. As option 2, with the optional participant sort of ADR 0012 for panels of
   15 or more.

## Decision outcome

Option 2 (owner decision 2026-11-20). Option 3 adds a step the evidence does
not support.

- **Existing models (EL7, EL12, EL20):** the facilitator imports source
  models and picks, in the coverage table, which elements go on the list.
  The Overview checklist starts with this step.
- **First look (EL22):** each participant goes through the imported
  elements one at a time and answers "Does this element belong to the concept
  <name>?" with Belongs, Not sure or Does not belong. The answers tell the
  facilitator what the group thinks and decide nothing; the Delphi rates in
  Decide.
- **Brainstorm board (EL23):** one column per brainstorm question (EL14),
  using the full height of the page. Imported elements show in their column
  with a dashed border, your own elements are marked, and the elements of
  others stay hidden until the reveal (EL13), shown only as a count per
  column. A strip shows how many people have added elements.
- **Grouping (EL18):** every element starts in a group. A brainstormed
  element starts under the question it was added to. An imported element
  starts by its place in the source model: for an openEHR OBSERVATION,
  `data` goes to the measurement, `state` to the patient's state and
  `protocol` to how it was measured
  (<https://specifications.openehr.org/releases/RM/latest/ehr.html>). A FHIR
  StructureDefinition has no such parts, so its elements start under the
  measurement. Elements without a known place, such as rows from a CSV file
  (EL3), start in "Not grouped yet". The facilitator moves elements by drag
  and drop, with "Move here" as the keyboard path, and can rename or add
  groups. No spec governs this mapping; our own design.
- **Check the groups (EL24):** participants mark an element "Same as…" or
  "Belongs elsewhere" and say per group if something is missing. Other
  participants do not see the remarks (EL2).
- **Groups in the rounds (DE19):** the groups become headings in round 1,
  and each participant sees the groups in a different order, as Brookes et
  al. 2018 recommend.
- **Phase recaps (PR13):** a done phase step in the header opens a
  read-only recap of that phase. The Discover recap shows how many elements
  went into round 1, from which models, people and files, how many
  duplicates were merged, and the groups. The current phase step is not a
  link; its work is on the project home or the Overview. Later phases are
  not links.

### Consequences

- Good: participants start from what exists and only add what is missing,
  so nobody types a known element again.
- Good: the facilitator corrects a grouping instead of building one, and
  participants check it with two marks instead of a full sort.
- Bad: a first look adds one step for participants before the brainstorm,
  about one click per imported element.
- Bad: the FHIR grouping is coarse: every element of a profile starts under
  the measurement and the facilitator moves the rest.
- The participant sort (EL8) is withdrawn.
