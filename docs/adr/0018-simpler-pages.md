<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0018. Simpler pages: where you are, one task, fields in their phase

- Status: Proposed
- Date: 2026-11-20
- Deciders: owner (D6, D7 and D8 of the design evaluation, and its section 7), maintainer (design)

## Context and problem statement

After the compact views of ADR 0013, the owner still found the app denser and
more complex than needed, and participants lost track of the current step
once they left the overview. The walkthrough of the
[design evaluation](../evaluations/2026-11-20-design-evaluation.md) found
fields shown before their phase, project settings on the Rounds and Members
pages, and a Members page 2,250 px tall.

## Decision outcome

Six principles for every page (owner decision 2026-11-20); no spec governs
them, our own design:

1. One task per page; reference material folded or one click away.
2. Only what the phase and role need (PR9 for steps, EL21 for fields).
3. At most one intro line per page; help text only under a field that needs
   it; no sentence repeated across pages.
4. Settings off task pages (PR12).
5. Where you are, always (PR11): the steps and the task line in the project
   header replace the Phase and Role badges and the Overview tab.
6. One main button per page; other actions in a menu or in an item's details.

Concretely:

- **Header (PR11):** the project name, one line of the scope, the five steps
  with the current one marked, and the task line with its button, on every
  project page. The project opens on the current step's page.
- **Top bar:** one menu under the person's name with language, theme and sign
  out; Administration only for administrators.
- **Settings (PR12):** change class, minimum panel, private brainstorm and
  group names on a facilitator Settings page; Members keeps people and
  invitations, Rounds keeps rounds.
- **Fields in their phase (EL21, EL1):** in discover the board shows name,
  description, brainstorm question, sources and support; data type,
  cardinality and values appear in the detail phase, and adding an element
  asks only for a name and a description.
- **Brainstorm:** one field with a choice of question instead of four forms;
  participants add elements only there in discover.

### Consequences

- Good: a participant sees where the project is and what to do on every
  page, with less on screen.
- Bad: the Overview tab and several page layouts change at once; e2e specs
  that navigate by tab change with them.
