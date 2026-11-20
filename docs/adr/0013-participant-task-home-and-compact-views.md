<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0013. A task home for participants, compact views and lean Delphi feedback

- Status: Proposed
- Date: 2026-11-20
- Deciders: owner (participant home and compact views first), maintainer (design)

## Context and problem statement

The owner tested the v0.1.0 demo. Participants could not see what was
expected of them, and the pages were complicated and tall. A participant
lands on the project tabs, with no "what do I do now". The board shows each
element as a card of about 245 pixels high, the results page of 8 elements
is about 4,700 pixels high, and the rating page shows the full results of
the previous round above every element, so the rating itself starts below
the first screen. The phase badge said "Scope" while round 2 was open.

On the rating page each element also showed its outcome label from the
previous round. The COMET Handbook feeds back the participant's own previous
score and the distribution per stakeholder group (Williamson et al. 2017,
<https://doi.org/10.1186/s13063-017-1978-4>, figure 3), and multi-group
feedback raised agreement between patients and professionals (Brookes et al.
2016, <https://doi.org/10.1186/s13063-016-1479-x>). No guidance recommends an
outcome label mid-process. Feedback showing at least 75% agreement moved
experts toward the group (Barrios et al. 2021,
<https://doi.org/10.1016/j.techfore.2020.120484>), and 21% of score changes in
core outcome set Delphis came from "vicarious thinking", mostly from seeing
others' scores (Fish et al. 2020, <https://doi.org/10.1016/j.jclinepi.2020.09.028>).
A label adds a push to those effects without adding information: a next
round carries over only the elements without consensus (DE7), so every
label reads "no consensus".

## Considered options

1. Keep the tabs as the start page and shorten the cards.
2. A task home per project for participants, compact list views with details
   on demand, and Delphi feedback limited to the person's own score and the
   distribution.

## Decision outcome

Option 2.

- **Task home (PR8).** A participant opens a project on one card: the current
  phase in one sentence, the deadline with its time zone, what they have done
  so far as a count ("You added 3 elements", "12 of 40 rated") and one main
  button. The phases show as a row of steps in text. The tabs stay for
  reading. A count is used instead of a progress bar: in a meta-analysis of
  32 experiments, constant progress bars did not lower drop-off (Villar,
  Callegaro and Yang 2013, Social Science Computer Review 31, pages 744 to 762,
  <https://research.google/pubs/where-am-i-a-meta-analysis-of-experiments-on-the-effects-of-progress-indicators-for-web-surveys/>).
- **Phase drives the home (PR4).** The phase becomes a Must, because the
  task home reads it.
- **Compact views (Q-USE-1).** The board and the results show one row per
  element; details open in a side panel or an expanding row. Results show a
  small distribution bar per element, with the per-group charts behind
  "Show by stakeholder group".
- **Lean feedback (DE15).** While a round is open, a participant sees per
  element their own previous score and the distribution per stakeholder
  group, with the median and band shares behind "details", and no outcome
  label. After a round closes, the full results stay visible to everyone
  (DE5).

### Consequences

- Good: a participant sees one task and one button; the rating starts on the
  first screen.
- Good: the feedback follows the COMET example and leaves out the push of a
  label.
- Bad: the facilitator's pages and the participant's pages diverge, so the
  e2e specs need a participant walkthrough of their own.
- The 24-hour reminder for people who have not finished, as Loomio sends
  (<https://www.loomio.com/how-it-works/>), needs scheduled e-mail; it is left
  for a later requirement.
