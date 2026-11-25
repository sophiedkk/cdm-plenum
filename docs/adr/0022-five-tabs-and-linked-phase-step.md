<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0022. Five facilitator tabs, a linked current phase step and back links that name their target

- Status: Proposed
- Date: 2026-11-25
- Deciders: owner (decided on the UI/UX analysis of 2026-11-25), maintainer (design)

## Context and problem statement

The facilitator has seven tabs (ADR 0019), and on a phone the strip scrolls
sideways, so the current tab can sit out of view. The GNOME Human Interface
Guidelines advise a view switcher for "between three and five views"
(<https://developer.gnome.org/hig/patterns/nav/view-switchers.html>, read on
2026-11-25). The phase steps showed the status only, so the current step, the
one a user most expects to click, led nowhere. Every back link read "Back to
the project", whatever the page. Findings P3 and A5 of the
[UI/UX analysis of 2026-11-25](../evaluations/2026-11-25-ui-ux-analysis.md)
describe this.

## Considered options

1. Keep seven tabs and only scroll the current one into view.
2. Five tabs, with People and Settings in a menu.
3. Merge Elements and Details into one "Model" tab, as the analysis sketched.

## Decision outcome

Option 2 (owner decision 2026-11-25). No spec governs navigation; our own
design, checked against the HIG.

- **Tabs:** Overview, Scope, Elements, Rounds and Detail, plus a "Project"
  menu at the end of the row with People and Settings. On those two pages the
  Project trigger is the current item (`aria-current`), and both stay reachable
  by URL. Pages without a tab keep marking the tab they belong to (`UNDER`).
  On a phone the current tab scrolls into view when you navigate.
- **Current phase step:** links to the phase home, which is the project index:
  the Overview for the facilitator and the project home for a participant. It
  keeps `aria-current="step"` and its state text. Done steps link to their
  recap and later steps stay plain text. This revises the status-only steps of
  2026-11-20 for the current step only; the reason for that decision (a step
  that opened a page left the page you were on unmarked) holds for the other
  steps, as the current step opens the page the project opens on.
- **Back links:** a participant's step page says "Back to your task". The
  facilitator's pages keep "Projects", because the tabs already give the way
  within the project, so the project home is not offered twice. A recap page
  keeps "Back to the project".

### Consequences

- Good: five views fit a phone width, and the current one stays visible.
- Good: the current step is no dead end, and each back link says where it goes.
- Bad: People and Settings take two clicks. They are used less often than the
  other pages.
- Bad: ADR 0019 and ADR 0020 describe the status-only steps; this record
  replaces that for the current step.
