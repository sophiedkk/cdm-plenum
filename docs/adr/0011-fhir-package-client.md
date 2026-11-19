<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0011. One FHIR package client on the FHIR package registry, R4 first

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner (look at the FHIR world, R4 first), maintainer (design)

## Context and problem statement

Developing a clinical data model includes checking what HL7 FHIR already
offers: core resources, the International Patient Summary, and national
profiles such as the Nictiz zibs. Without that check, an archetype and a FHIR
resource for the same concept drift apart (Leslie and Bakke, MEDINFO 2017).
The owner wants a FHIR reuse check next to the CKM check (EL10, Should), an
import of a profile's elements (EL11, Could) and a logical model export (EX6,
Could). FHIR content is published as packages in the FHIR NPM package format
(<https://hl7.org/fhir/packages.html>) through the registry at
`https://packages.fhir.org`, which answers without sign-in.

## Considered options

1. The FHIR package registry, through one client module like the CKM client.
2. Simplifier.net's API, which also hosts many packages.
3. A FHIR terminology or conformance server per project.

## Decision outcome

Option 1. The registry is the public, vendor-neutral source that the HL7
tooling itself uses, and it serves whole packages, so one download gives
every StructureDefinition of a version. Option 2 ties the tool to one vendor;
option 3 needs a server per project.

- `src/server/fhir/` is the only module that calls the registry, with a
  timeout, a size cap, typed results and a cache, and a boundary test like
  ADR 0006.
- FHIR R4 first: most implementation guides, the IPS and the Nictiz zib2020
  package are R4. R5 can follow.
- A link stores package, version, canonical URL and element path.

### Consequences

- Good: openEHR and FHIR reuse are checked in the same place, and the board
  shows both links on one element.
- Bad: packages can be large (the R4 core package holds every resource); the
  client must cap and cache them.
- Which packages hold logical models (for example the zibs) is not checked
  yet; EL11 depends on it.
