<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0015. What a participant sees and does follows the phase

- Status: Proposed
- Date: 2026-11-20
- Deciders: owner (later phases hidden, earlier phases read only, the facilitator prepares ahead), maintainer (design)

## Context and problem statement

A project moves through phases (PR4), and the overview tells each
participant what is expected of them now (PR8). Every tab and action was
still available from the start: a participant in the scope phase could open
the board and the rounds, and add elements before the brainstorm began. The
owner found this confusing: the participant could not see which step was
the current one.

## Considered options

1. Leave every step open; rely on the overview to point at the current one.
2. Show later steps disabled, with the phase in which they start.
3. Hide later steps from participants, keep earlier steps readable, and
   allow writing only in the current phase.

## Decision outcome

Option 3 (owner decision 2026-11-20). Nothing on screen invites an action
that is not possible yet, and the phase steps on the overview already show
what comes next. No spec governs this; it is our own design.

What a participant sees and does per phase (PR9):

| Step | Scope | Discover | Decide | Detail | Hand-off |
|---|---|---|---|---|---|
| Overview, Members | read | read | read | read | read |
| Scope | comment | read | read | read | read |
| Brainstorm | hidden | add | hidden | hidden | hidden |
| Element board | hidden | comment | read | read | read |
| Rounds | hidden | hidden | rate | read | read |

The server enforces the same rules: a participant's write outside its phase
is refused, and a read of a step that has not started returns nothing. The
detail phase follows the table once it is built (ADR 0014).

The facilitator sees every step at any time and can prepare ahead, for
example import elements or set up a round. An action that reaches
participants needs its phase (PR10): opening a round needs the decide phase,
revealing the board the discover phase, and the project cannot leave the
decide phase while a round is open.

### Consequences

- Good: a participant sees one step to work on and the steps that led to it.
- Good: the facilitator can still get the next step ready.
- Bad: a participant who wants to add a late comment on the scope or the
  board cannot; they reach the facilitator, who can move the project back a
  phase.
- Element proposals in round 1 (DE16) stay possible in the decide phase: they
  are part of the round, not of the board.
