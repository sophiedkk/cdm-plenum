<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0016. Discover starts from existing models; one link to any standard

- Status: Proposed
- Date: 2026-11-20
- Deciders: owner (D1 and D5 of the design evaluation, facilitator-only import), maintainer (design)

## Context and problem statement

Every participant started the long list from scratch, and only the
facilitator could import, only from CKM. For most clinical concepts FHIR
profiles exist, often several, none of them maximal; openEHR archetypes and
zibs exist for many too. Linking was CKM only, which reads as an openEHR-only
tool. The [design evaluation of 2026-11-20](../evaluations/2026-11-20-design-evaluation.md),
section 3, has the findings and sources.

All three sources can be read by machine: FHIR packages from the
[package registry](https://hl7.org/fhir/packages.html), whose StructureDefinition
snapshots list each element with type, cardinality, element code and binding
([ElementDefinition](https://hl7.org/fhir/R4/elementdefinition.html));
CKM archetypes through the CKM REST API the app already uses; zibs through
their FHIR profiles, which map each element to its zib concept id.

## Considered options

1. Keep the CKM import and add a FHIR import beside it, each on its own.
2. A compare-and-pre-seed step at the start of discover that imports from
   several source models, matches their elements and shows where they differ,
   with one kind of link to a source-model element for every standard.

## Decision outcome

Option 2 (owner decision 2026-11-20).

- **Source models (EL12):** the facilitator picks the source models: FHIR
  packages and their profiles or logical models, CKM archetypes, and zibs
  through the zib FHIR profiles. A participant can suggest a source model;
  only the facilitator imports.
- **Matching and coverage (EL20):** imported elements are matched across
  sources on the same LOINC or SNOMED CT element code, then on a declared
  mapping, then on a similar name; only a code match counts, the rest are
  suggestions the facilitator confirms. A coverage table shows one row per
  candidate element and one column per source model, with each model's type,
  cardinality and binding. The union of the sources starts the long list.
- **One link (EL4, EL7, EL10, EL11):** an element links to elements of source
  models of three kinds: an openEHR archetype element (archetype id, at-code,
  revision), a FHIR element (package, version, canonical URL, element path) and
  a zib concept (NL-CM id, zib version). An element can carry several. FHIR
  links and imports become Must.
- Imported elements go into the Delphi like any other; a source fills the
  long list and decides nothing. The private brainstorm stays, for what no
  model has yet.
- No export per standard now; when one comes, it covers FHIR and openEHR
  together (owner decision 2026-11-20).

### Consequences

- Good: nobody copies a profile or archetype by hand, and the group sees
  where the existing models differ before it brainstorms.
- Bad: the tool reads FHIR packages, a second external source next to CKM,
  with its own client and contract test (ADR 0011 already plans that client).
- Name matching is a suggestion only; no spec governs it, our own design.
