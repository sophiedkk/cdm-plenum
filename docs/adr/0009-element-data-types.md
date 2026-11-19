<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0009. Element data types: openEHR RM types paired with FHIR types

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner (use RM types with a FHIR bridge), maintainer (the list)

## Context and problem statement

A candidate element needs a data type that a modeller can carry into an
archetype without retyping (EX5), and that a later zib or FHIR export can use
(W5). Free text, as first drafted, cannot be checked or exported. Clinicians
on the panel are not modellers, so the list must stay short and explained.

## Considered options

1. Free text.
2. The full set of openEHR RM data value types.
3. A short list of keys, each naming one openEHR RM type and the nearest FHIR
   data type.

## Decision outcome

Option 3. The list in [architecture.md](../architecture.md#element-data-types)
holds 17 keys. Abstract RM types (`DV_ORDERED`, `DV_AMOUNT` and others), the
deprecated `DV_PARAGRAPH`, and types rarely chosen in early design
(`DV_PARSABLE`, `DV_STATE`, `DV_EHR_URI`, the time specification types) are
left out. `DV_INTERVAL` appears only as an interval of quantities and of date
and time, which pair with FHIR `Range` and `Period`.

openEHR is the source of truth: a key stores the RM type, the FHIR type is
derived. No specification maps the two models onto each other; the pairing
is our own design, checked against the openEHR RM data types specification
and the FHIR R5 data types page.

### Consequences

- Good: the archetype skeleton and the CSV carry real RM type names.
- Good: a FHIR or zib export needs no second data type decision.
- Bad: `DV_ORDINAL` and `DV_SCALE` have no core FHIR type that carries the
  score; they pair with `CodeableConcept` and lose the number in a FHIR
  export unless an extension is chosen then.
- Bad: a CKM element with a type outside the list keeps its RM name but has
  no FHIR type.
