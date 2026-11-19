<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0005. Rating pseudonyms and anonymity on the server

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner (facilitator visibility optional), maintainer (design)

## Context and problem statement

Ratings must be anonymous to other participants, always. Whether the
facilitator may see who gave which rating is a setting of the round, off by
default (DE4). At the same time a participant must see and change their own
ratings, see their own rating from the previous round (DE7), and the
anonymised ratings export needs a stable code per participant (EX4).
Anonymity in Delphi panels reduces the pull of senior voices (Hasson, Keeney
and McKenna 2000, <https://doi.org/10.1046/j.1365-2648.2000.t01-1-01567.x>).

## Considered options

1. Store the member id on each rating and filter it out in the queries.
2. Store a per-project rating code on each rating; the link from code to
   member lives in one table that only two queries read.
3. Store ratings without any link to the participant.

## Decision outcome

Option 2.

- Each participant gets one random `rating_code` per project when they join.
  Ratings carry the code, never the member id.
- The code-to-member table is read by exactly two queries, both in
  `src/server/rounds/rater-link.ts`: the own-code lookup for the signed-in
  participant (used for "my ratings" and for rating writes), and "ratings by
  participant" for the facilitator, which runs only when the round's
  `facilitator_sees_raters` is true. `src/server/rounds/anonymity.test.ts`
  fails when another module reads the table. Rows are inserted only when a
  person joins a project.
- Each rating stores the rater's stakeholder group (`rating.team_id`), so
  results per group need no lookup through the code.
- A facilitator who joins a stakeholder group rates with the code created
  with the project, like any participant (DE14). The setting that shows
  participants who is in each group (PR7) lists names per group only; it
  never links a name to an element, a comment or a rating.
- `facilitator_sees_raters` is fixed when the round opens, like the rule
  (DE2), and shown to participants before they rate.
- Option 3 is rejected because it breaks DE3 and DE7. Option 1 is rejected
  because every query on ratings would then have to remember to drop a
  column.

Author columns on elements and comments follow the same pattern: they are
selected only in facilitator queries.

### Consequences

- Good: the default path through the code cannot leak who rated what.
- Good: the EX4 export uses the code as it is.
- Bad: the server can still link codes to people; this is pseudonymity, not
  anonymity against the operator. The study information for participants
  must say so.
