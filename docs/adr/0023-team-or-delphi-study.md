<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0023. Two ways to run a project: Team or Delphi study

- Status: Accepted
- Date: 2026-11-25
- Deciders: owner (after feedback from an openEHR modelling practitioner,
  issue #106), maintainer (design)

## Context and problem statement

cdm-plenum is built as an e-Delphi study: participants rate each element
anonymously on a scale of 1 to 9 against a consensus rule fixed in advance
(DE1, ADR 0005, Q-ANON-1). That suits a study whose result has to be
reportable, such as the decision report after the ACCORD guideline (EX3).

A practitioner of openEHR modelling programmes answered that they would not
want numeric ratings or anonymity: clinicians, informaticians and
terminologists work best as one named team that decides by discussion, with
sub-teams at points in the process. Both ways of working are real, for
different groups.

## Considered options

1. Keep the Delphi study only.
2. Replace it with team work.
3. Let the facilitator choose per project.

## Decision outcome

Option 3 (owner decision 2026-11-25). A project runs in one of two modes:

- **Delphi study:** as now. Anonymous to the other participants, rounds on
  a 1 to 9 scale with a consensus rule.
- **Team:** participants are named, and a round decides by consent. Each
  member answers Include, Leave out or Discuss, with a reason for Leave out
  and Discuss; "Unable to judge" abstains. When every answer is Include the
  element is in the model; when every answer is Leave out it is not; any
  other mix makes it "To discuss", and the facilitator settles it after the
  discussion with a short note. This follows the consent of the detail
  phase (DT2).

In a Team project the other participants see by name who added an element,
who wrote a comment, and each person's answer and reason in a round's
results once the round closes; the exports name people too.

The facilitator chooses the mode when creating the project and can change it
until the first round opens. After that it is fixed, so nothing given
anonymously ever becomes named.

Both modes share the phases, the board, the detail phase and the exports.

### Consequences

- Q-ANON-1 and ADR 0005 apply to Delphi projects only.
- A Team project's decision report names its rule as consent and lists the
  settled "To discuss" elements with their notes.
- The default for a new project is the Delphi study, so existing projects
  keep their behaviour.
