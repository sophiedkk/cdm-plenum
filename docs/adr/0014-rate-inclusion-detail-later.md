<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0014. The Delphi rates inclusion; the details are settled in a step of their own

- Status: Proposed
- Date: 2026-11-20
- Deciders: owner (rate inclusion only, a separate detail step as a phase of its own, one card per element), maintainer (design)

## Context and problem statement

In a rating round a participant scores an element as it stands on the board:
its name and description, but also its data type, cardinality and proposed
values. A low score is then ambiguous. It can mean "this does not belong in
the model", "it belongs, but not as a quantity" or "the value list is
wrong", and the results cannot tell these apart. The facilitator does not
know what to change for the next round. The owner also found the rating
screen too dense: every element showed its details and the feedback of the
previous round at once.

Core outcome set development separates two questions: which outcomes belong
in the set, agreed in the Delphi, and how each one is measured, decided after
it: "the first step in the process is typically to gain agreement about
'what' to measure, with decisions about 'how' and 'when' to measure these
outcomes usually later in the process" (Williamson et al. 2017, the COMET
Handbook, section 2.1, <https://doi.org/10.1186/s13063-017-1978-4>). The Nictiz management
agreements split the expertise the same way: clinical experts for the
content, terminology and architecture experts for codes and structure
([ADR 0010](0010-minimum-panel-as-guideline.md)).

## Considered options

1. Keep one score for the element as it stands.
2. Rate inclusion, and also agree or disagree with each detail in the same
   round.
3. Rate inclusion only; settle the details afterwards, for the included
   elements, in a step of their own.

## Decision outcome

Option 3 (owner decision 2026-11-20). One score answers one question, so a
result can be read, and the people who know about data types and code lists
work on the details once the content is agreed. Option 2 makes every
participant judge every detail, including details outside their expertise.

- **Rating (DE1):** the question is whether the element, by its name and
  description, belongs in the model. Data type, cardinality and values show
  as context, folded away and marked as not rated.
- **Flags (DE17):** while rating, a participant can mark a detail as wrong
  and give a reason. The facilitator sees the flags per element and takes
  them to the detail step.
- **One card per element (DE18):** the rating screen shows one element at a
  time with "Previous" and "Next", how far the participant is, and an
  overview to check every rating before leaving.
- **Detail step (DT1 to DT3):** after the last round, modellers and
  terminologists propose the data type, cardinality and value list of each
  element in the model. Participants answer each proposal with "agree" or
  "objection with a reason", the consent method already used for the scope
  (SC3, Sociocracy 3.0,
  <https://patterns.sociocracy30.org/consent-decision-making.html>). A
  contested value list can get a short rating round of its own.
- **A fifth phase:** the detail step becomes a phase of its own, "Detail",
  between decide and hand-off, so the overview can show each person their
  task in it (PR4, PR8). Owner decision 2026-11-20.

### Consequences

- Good: a score means one thing, and the round results show where the group
  disagrees about content.
- Good: the rating screen asks one question per element and fits on one
  screen.
- Bad: a project takes one step more before hand-off, and the details of an
  element in the model are open until that step ends.
- An element changed between rounds by the facilitator, for example a
  sharper description, keeps its ratings; no spec governs re-rating after a
  change, and the round history shows what was rated.
