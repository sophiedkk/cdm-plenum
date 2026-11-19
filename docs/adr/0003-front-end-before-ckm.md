<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0003. A front end before CKM, not a modelling tool

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner

## Context and problem statement

Clinical model development runs from scope through requirements gathering,
design, review rounds and publication (Moreno-Conde et al., JAMIA 2015,
<https://doi.org/10.1093/jamia/ocv008>). Archetype Designer and the ADL
Workbench cover authoring; CKM covers review and publication. Scoping,
collecting candidate elements and checking them for reuse happen in mind maps
and spreadsheets that nothing links to the final model, and CKM reviews give
one overall recommendation per reviewer instead of a rating per element.
Where should cdm-plenum sit?

## Considered options

1. A front end before CKM: scope, element discovery, reuse check, rating
   rounds per element and a decision record, handing off to the authoring
   tools and CKM.
2. The full lifecycle, including ADL authoring and review rounds.
3. A consensus module next to CKM review of an existing draft.

## Decision outcome

Option 1. It fills the stages no tool covers and does not compete with CKM or
Archetype Designer. The Won't list in the requirements (W1, W2, W4) follows
from it.

### Consequences

- Good: a small, clear scope for the first version.
- Good: the hand-off formats (CSV, FreeMind, later ADL) are ones modellers
  already use.
- Bad: two tools in a row; a group still moves to CKM for formal review.
