<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# cdm-plenum UI/UX analysis and plan

2026-11-20. Written and discussed in a shared document
(<https://claude.ai/artifact/1YCzjwWnQ7tkkeW9ha64YW>); this file is the copy
kept with the code. The owner asked to execute the plan on 2026-11-20; the
participant tab bar (option A without, option B with a small one) is decided
on the clickable mock-ups of step 2.

## Verdict

The app is calm and consistent, and the rating page and round results work
well. It still feels dense for three reasons, none of them colour or
decoration:

1. **Three navigation layers on every project page:** the phase steps, the
   task line and the tabs, about 140 px of controls in three styles before any
   content, and 360 px on a phone.
2. **Pages built around objects, not tasks:** Scope, Board, Rounds and Members
   are pages about things. A participant asks "what do I do now?"; a
   facilitator asks "what must be done before I can move on?". Neither
   question has a page.
3. **Every page explains itself on every visit:** a heading that repeats the
   tab, a description, help under idle fields, anonymity stated three times on
   the rating page.

The plan: a home page per project built around one task for participants, a
phase checklist for the facilitator, fixed navigation that never reorders,
and a small set of layout rules. Two reviews found this independently: one
by the maintainer and one by a second reviewer who saw only 53 screenshots
and a description of the product.

## Findings

From 53 screenshots of the redesign in #47 (every page per phase, both roles,
and a phone). Ranked by impact.

| # | Finding | Who | Impact |
| --- | --- | --- | --- |
| 1 | Three navigation layers compete above the content; the steps look clickable but only show status; the task line, the most useful element, is the weakest visually. | both | high |
| 2 | The tab order changes per phase (Scope first in scope, Rounds first in decide, Export first in hand-off); someone returning after two weeks finds tabs in new places. | both | high |
| 3 | The task line is sometimes wrong (the facilitator's scope task points at the empty board), often repeated ("Rate round 2" three times for a participant, also on the rating page itself), and mixes phase moves with navigation. | both | high |
| 4 | Every page repeats its explanation: heading, description, sub-heading; help under idle fields; anonymity three times on the rating page. | both | high |
| 5 | The facilitator sees controls outside their phase: Brainstorm in decide and hand-off, Export in scope, "New round" with an empty board; idle forms always open. | facilitator | high |
| 6 | Nothing shows a participant where the model stands: which elements are in, out or still open, outside a round's results; hand-off says only "nothing more to do". | participant | medium-high |
| 7 | Scope comments read "By a former member" for current members whose name is hidden; your own comment is not marked as yours. | participant | medium, trust |
| 8 | Tables where a list would do: 9 to 10 board columns full of 0 and "Not linked"; a participant's Members tab as a 9-row table; 18 Rename and Remove buttons. | both | medium |
| 9 | The rating page is the best page but too tall; the round 1 feedback weighs as much as the question; on a phone the scale starts 900 px down and the keyboard hint shows on a touch screen. | participant | medium |
| 10 | Settings has four separate save buttons; a change in one block is lost when another is saved. | facilitator | medium |
| 11 | Smaller: two date formats; the scope line in the header is cut off mid-sentence; the projects list does not say what is waiting; the task line still says "how important" while the question is "does it belong"; the admin log shows project ids and raw codes on an 11,436 px page; the CKM-only label "Search CKM". | both | low |

On a phone (390 px) nothing scrolls sideways, but the header stack takes
360 px, the person menu and the tabs wrap, and a rating card needs 1,480 px.

## A new navigation model

- **Participant: a project home with one "Your turn" card.** The home shows
  the current ask large, with its deadline and progress; what is decided so
  far (in, out, still open); and the phases as a short timeline in words.
  Scope, Elements and Results are linked from the home with a back link.
  Members and "Leave project" move into an "About this project" panel.
- **Facilitator: a fixed tab bar and an Overview checklist.** The tabs are
  always Overview, Scope, Elements, Rounds, People, Settings, in that order.
  Overview holds the checklist for the current phase, which ends in the phase
  move behind a confirmation. Brainstorm becomes part of Elements; Export
  becomes a section of Overview in hand-off.
- **Both:** the header keeps the project name and a short phase label
  ("Decide, phase 3 of 4"); the steps move into the home card and the
  Overview.
- **Projects list:** each project shows what is waiting for you and by when,
  waiting first.

Participant home, decide phase:

```
Blood pressure                                  Decide · phase 3 of 4
+------------------------------------------------------------------+
| Your turn: rate round 2                                          |
| 2 elements · about 3 minutes · closes Thu 26 Nov, 23:05          |
| 0 of 2 rated                                   [ Start rating ]  |
+------------------------------------------------------------------+
Decided so far                                       6 of 8 elements
  In the model    Systolic · Diastolic · Position · Location · Comment
  Not in          Pulse pressure
  Still open      Mean arterial pressure · Cuff size  (round 2)

Scope done  >  Discover done  >  Decide now  >  Hand-off
Read the scope   ·   All elements   ·   About this project
```

Facilitator Overview, discover phase:

```
Heart rate                                    Discover · phase 2 of 4
Overview   Scope   Elements   Rounds   People   Settings

Before you open round 1
  done  5 of 8 participants added elements        [ Send reminder ]
  to do Reveal the board to everyone              [ Reveal board ]
  to do Merge duplicates: 2 likely pairs          [ Review ]
  to do Compare with existing models               [ Compare ]
                                         [ Go on to Decide ]
Move back to Scope   (a text link with a confirmation)
```

Rating card, question first and feedback folded:

```
Mean arterial pressure                                  1 of 2  o o
The average arterial pressure over one cardiac cycle.
Does this element belong in the data model?
  Does not belong        Unsure            Belongs
  [1] [2] [3]           [4] [5] [6]       [7] [8] [9]   [Unable to rate]
  Your round 1 score: 5        Reason (optional) [__________________]
> How the group scored in round 1
< Previous                    Overview                        Next >
```

## Layout and component rules

| Rule | What it means |
| --- | --- |
| One primary action per view | The filled button means "the next step"; everything else is outline or text. The scope page goes from three filled buttons to one. |
| A type scale of five sizes | 14 meta (nothing smaller for content), 16 body, 18 section, 24 page title, 30 the home card heading; weights 400 and 600 only. |
| A spacing scale on 4 px | 4, 8, 12, 16, 24, 32, 48; 24 between blocks, 48 between sections. |
| Cards, lists, tables by job | A card for the task card and for repeated independent items; a list for what participants read (elements, rounds, comments); a table only for facilitator comparisons of four rows or more (board, results, people). |
| Help on demand | No description under page titles; help under a field only on focus or error; one "About this page" where a page needs explaining. |
| Show a value only when it says something | The board's sources, comments and CKM link collapse into one "Signals" cell that shows each only above zero; an Outcome column appears from decide. |
| Save without a button where safe | Settings save on change with a short confirmation, or one save bar per page; never one save button per block. |

Colour stays neutral, with colour only for status and the current step.

## Keep

- The task line's idea: one sentence and one button for "what now"; it moves
  into the home card and the Overview.
- The rating flow: one element at a time, bands, "Unable to rate", autosave,
  the earlier-score marker and the keys.
- Round results: outcomes with text, the median, small distributions and
  details per row.
- The neutral palette, colour only for status, and empty states with one
  clear button.
- The closed-step note and the privacy model in the UI: the private
  brainstorm, reasons without names.
- From #47: the person menu, the Settings page, fields only in their phase,
  and the one-field Brainstorm.

## The plan

1. **Quick fixes**, one PR, no design decision needed: the "By a former
   member" label ("A participant", and "You" for your own); the task line's
   "how important"; buttons that point at the page you are on; the duplicate
   "Rate round 2" and the repeated closing date and anonymity notes; the
   keyboard hint on touch screens; one date format; the admin log with project
   names, readable actions and paging; "Search CKM" labelled with the model it
   searches.
2. **Mock-ups first:** four screens as a clickable prototype to try before
   anything is built: the projects list, the participant's project home, the
   facilitator's Overview, and the rating card.
3. **Navigation and home pages:** after approval of the mock-ups, the
   participant home with "Your turn" and "Decided so far", the facilitator's
   fixed tabs with the Overview checklist and the phase move in it, and the
   projects list with what is waiting.
4. **The layout rules, page by page:** one primary action, the type and
   spacing scale, lists instead of tables for participants, the board's
   Signals and Outcome columns, Settings saving without four buttons, help on
   demand.
5. **A phone pass:** a compact header, the scale above the feedback, tabs as a
   scroller.

The comparison of existing models becomes the "Compare with existing models"
item of the facilitator's Discover checklist, and the detail phase gets its
own checklist and a participant task card; both are built on the new
navigation, after step 3. #47 can be merged; step 3 replaces its header and
task line. #48 is not affected.

## Decisions

| # | Decision | Recommendation |
| --- | --- | --- |
| U1 | Participants get a project home with one "Your turn" card instead of a tab bar | Yes; it removes two of the three navigation layers for the people who visit least. |
| U2 | The facilitator gets fixed tabs (Overview, Scope, Elements, Rounds, People, Settings) with a phase checklist on Overview | Yes; the phase move moves into the checklist, behind a confirmation. |
| U3 | "Decided so far" on the participant home, and an Outcome column on the elements | Yes; it answers "where are we" with the model itself. |
| U4 | Brainstorm becomes part of Elements for the facilitator; Export a section of Overview in hand-off | Yes; fewer tabs, each with a lasting job. |
| U5 | The seven layout rules go into CLAUDE.md and apply to every page | Yes. |
| U6 | Clickable mock-ups of four screens before building step 3 | Yes. |
| U7 | Merge #47 now, knowing step 3 replaces its header | Yes; the rest of it stays. |
