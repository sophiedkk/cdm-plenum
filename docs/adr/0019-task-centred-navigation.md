<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0019. Task-centred navigation: a project home and a facilitator Overview

- Status: Proposed
- Date: 2026-11-20
- Deciders: owner (U1 to U4 of the UI/UX analysis, approved on the clickable
  prototype on 2026-11-20), maintainer (design)

## Context and problem statement

After [ADR 0018](0018-simpler-pages.md) every project page carried three
navigation layers: the phase steps, the task line and the tabs, about 140 px
before any content. The tab order changed per phase, the task line repeated
itself on the page it pointed to, and no page answered "what do I do now?"
for a participant or "what must be done before I can move on?" for the
facilitator. The UI/UX analysis of 2026-11-20 lists the findings.

## Decision outcome

No spec governs navigation; our own design, approved by the owner on a
clickable prototype of four screens.

- **Participant (U1):** the project opens on a home with one "Your turn" card
  (the task of PR8, its facts and one main button), "Decided so far" from
  decide on (the outcome of each element's newest closed round; an element no
  closed round rated counts as "Not rated yet") and one "About this project"
  disclosure with the stakeholder groups (PR7) and "Leave project" (PR5).
  There is no tab bar: the phase steps in the header are links where a done
  or current phase has a page, and every other page has a link back to the
  home.
- **Facilitator (U2, U4):** fixed tabs that never reorder: Overview, Scope,
  Elements, Rounds, People, Settings. The project opens on Overview, with a
  checklist per phase, one main "Go on to" button and a quiet "Move back to"
  link, each confirmed in the page. The phase steps in the header show the
  status only. Adding an element on Elements replaces the facilitator's
  brainstorm; the export is the Overview of hand-off.
- **Projects list:** each project says what waits for you there and by when,
  projects with something waiting first.
- **Show once:** each piece of information shows once, in its best form; a
  picture and a text saying the same are not both shown, and screen-reader
  text carries what a picture shows.

This replaces the task line, the scope line and the per-phase tab order of
ADR 0018 (PR11). The phase table of [ADR 0015](0015-phase-bound-access.md)
still decides what a participant may open and write.

### Consequences

- Good: one navigation layer per role; a participant sees the task, what is
  decided and the phases on one page.
- Good: the facilitator finds every tab in the same place in every phase.
- Bad: PR8 and PR11 in the requirements still describe the task line and the
  per-phase order; the owner updates their text.
- Bad: e2e specs that navigated by tab or read the task line change with it.
