<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Architecture decision records

Each significant architecture or technology decision is recorded here in the
[MADR](https://adr.github.io/madr/) format
([0001](0001-record-architecture-decisions.md)).

| ADR | Title | Status |
|---|---|---|
| [0001](0001-record-architecture-decisions.md) | Record architecture decisions | Proposed |
| [0002](0002-stack-follows-edulims.md) | Follow the eduLIMS stack, trimmed | Proposed |
| [0003](0003-front-end-before-ckm.md) | A front end before CKM, not a modelling tool | Proposed |
| [0004](0004-projects-as-organizations-with-invitations.md) | Projects as better-auth organizations, joined by invitation | Proposed |
| [0005](0005-rating-pseudonyms-and-anonymity.md) | Rating pseudonyms and anonymity on the server | Proposed |
| [0006](0006-one-ckm-client.md) | One CKM client on the CKM REST API | Proposed |
| [0007](0007-english-code-and-i18n.md) | English code and an English and Dutch UI with Paraglide | Proposed |
| [0008](0008-compose-with-podman.md) | Compose on one host, developed with Podman | Proposed |
| [0009](0009-element-data-types.md) | Element data types: openEHR RM types paired with FHIR types | Proposed |
| [0010](0010-minimum-panel-as-guideline.md) | The minimum panel is a guideline with a recorded reason, not a gate | Proposed |
| [0011](0011-fhir-package-client.md) | One FHIR package client on the FHIR package registry, R4 first | Proposed |
| [0012](0012-discover-phase-sources-private-brainstorm-sort.md) | The discover phase: sources, a private-first brainstorm, an optional sort | Proposed |
| [0013](0013-participant-task-home-and-compact-views.md) | A task home for participants, compact views and lean Delphi feedback | Proposed |
| [0014](0014-rate-inclusion-detail-later.md) | The Delphi rates inclusion; the details are settled in a step of their own | Proposed |
| [0015](0015-phase-bound-access.md) | What a participant sees and does follows the phase | Proposed |

## Adding a record

1. Copy the structure of an existing record into `NNNN-short-title.md` with
   the next free number.
2. Set the status to `Proposed`, open a pull request, and set it to
   `Accepted` when it merges.
3. After acceptance, only the status of a record changes. A new decision that
   replaces it gets a new record, and the old record's status becomes
   `Superseded by NNNN`.
4. Add the record to the table above.
