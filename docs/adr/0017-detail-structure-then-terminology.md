<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0017. The detail phase settles structure first, then terminology

- Status: Proposed
- Date: 2026-11-20
- Deciders: owner (D2, D3 and D4 of the design evaluation), maintainer (design)

## Context and problem statement

ADR 0014 moved data type, cardinality and value lists out of the Delphi into
a detail phase. The owner then asked how codes, key-value pairs and term
bindings fit in. In openEHR, FHIR and zib practice the content comes first and
codes come later, from terminologists: CKM's policy is that "bindings and
translations should not hold up formal publication of the archetype"
([openEHR wiki](https://openehr.atlassian.net/wiki/spaces/healthmod/pages/2949146)).
A value list has two layers: the meanings (with ordinal numbers and units),
which are content, and their codes in SNOMED CT or LOINC, which are
terminology ([ADL2 7.13.4 and 8.2](https://specifications.openehr.org/releases/AM/latest/ADL2.html)).
FHIR, zibs and ADL2 share four binding strengths: required, extensible,
preferred and example ([FHIR R4](https://hl7.org/fhir/R4/terminologies.html#binding)).
Section 2 of the [design evaluation](../evaluations/2026-11-20-design-evaluation.md)
has the details.

## Considered options

1. One detail step for data type, cardinality, values and codes together.
2. Two steps in the detail phase: structure, then terminology.

## Decision outcome

Option 2 (owner decision 2026-11-20). No standard prescribes this order for a
group; it is our own design on the order the sources share.

- **Structure (DT1, DT2):** an information modeller proposes the data type, in
  neutral words, the cardinality (the widest any use case needs) and the value
  list with its meanings, ordinal numbers and units; the group answers by
  consent. A long or contested value list gets a rating round of its own
  (DT3, raised to Should).
- **Terminology (DT4, DT5):** once the structure of an element is settled, a
  terminologist proposes its codes: an element code, a code per value, the
  code system, a binding strength (required, extensible, preferred, example)
  and an optional value set URL. A second terminologist reviews; the group
  checks the meaning by consent. Open terminology does not hold up the
  hand-off.
- Narrowing for a use case (a template or profile) stays outside cdm-plenum.

### Consequences

- Good: terminologists work on a stable list, and the model keeps the four
  binding strengths every standard understands.
- Bad: the detail phase has two steps and more state; the paused detail-phase
  branch is reworked before it continues.
