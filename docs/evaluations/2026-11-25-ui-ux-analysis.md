<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# UI/UX, consistency and accessibility analysis after 0.3.0

2026-11-25, after the release of 0.3.0, when every phase has its pages. It
follows [the analysis of 2026-11-20](2026-11-20-ui-ux-analysis.md) and keeps
its decisions unless a finding below says why one should change.

## Method

A script visited every page the demo data reaches, for five accounts
(the facilitator of each demo project, a nurse, an architect and a
terminologist), at 1280 by 800 and at 390 by 844 pixels. It took 285
screenshots and measured on each page the visible type styles, the words,
the page height, the headings and the axe-core WCAG 2.1 AA result. Three
reviews read the screenshots, the measurements and the code: the
facilitator's pages, the participant's pages, and consistency with
accessibility across all pages. Two more questions were researched against
their sources: the nesting of the model tree, and the import of FHIR
profiles. The maintainer checked the main claims against the code and the
screenshots.

The owner raised five points before the review: the scope page is text
with little to do; ticking "Refers to another model" moves the screen; the
phase step you are on does not lead back to that phase's home; the detail
and hand-off pages are text heavy without guidance; and participants should
see more clearly what is expected of them, where they are and where they
came from.

## Verdict

The pages are accessible at the level axe tests: 278 of 285 pages pass,
and the 7 that fail (the settings and administration pages on a phone)
share one cause. Every page reflows at 390 pixels.
The problems are orientation, not access:

1. **A page does not say what it asks of you, or when you are done.** The
   participant's home names the task, but the page it opens does not repeat
   it, count progress or say "done". The Details page opens with a tree a
   nurse cannot act on; after answering, nothing changes but a grey button.
2. **The facilitator's "next step" is the phase move.** The one filled
   button on the Overview moves the project on while items are open, and
   the open items do not link to the work. A demo project reached hand-off
   with every element "Not settled".
3. **Finished phases stay editable.** In the detail phase the Scope page
   still offers two filled buttons, Rounds offers "New round", and Models
   invites an import.
4. **Modelling jargon reaches clinicians.** `DV_CODED_TEXT / CodeableConcept`,
   `1..1`, binding strength and LOINC codes that a nurse must consent to.
5. **The type scale has drifted.** Pages use 7 type styles on average and
   up to 11; the app uses 15 where the rule allows 10 (sizes 14, 16, 18,
   24, 30 at weights 400 and 600). Status badges and small buttons are 12
   pixels, under the minimum of 14.

## Findings

Sizes: S is a day or less, M a few days, L a week or more. Screenshot
names refer to the capture of 2026-11-25 (`<account>-<viewport>/<project>--<page>`).

### Orientation for participants

| # | Finding | Evidence | Fix | Size |
| --- | --- | --- | --- | --- |
| P1 | A step page does not state the task, the progress or the end. "Start" on the home lands at the top of Details, which opens on "Tree of the model: No proposal". | `participant-desktop/oxygen-saturation--details.png`, `task-card.tsx:116` | One task bar at the top of every step page: the task in one sentence, progress ("1 of 2 answered"), and "You are done" with the way back once nothing is left. Open items first, done items folded. | M |
| P2 | The home's task card misses parts of PR8: no explanatory sentence (the texts exist unused: `projects_task_scope`, `_discover`, `_rate`), no end date, and no done state for scope and discover. Architects and terminologists do not see what they must propose. | `--home.png` for each phase, `task-card.tsx:36`, `project-tasks.ts` | Show the sentence; count "to propose" for experts; a done line per phase. | S to M |
| P3 | Where you came from: every back link reads "Back to the project", and the current phase step is not a link. | `phase-steps.tsx:61-76` | The current step links to the phase home (owner decision needed, it revises 2026-11-20); the back link names its target ("Back to your task"). | S |
| P4 | Jargon on Details, the recap and hand-off: RM and FHIR type pairs, `min..max`, binding strength, version lines. | `structure-facts.tsx:27-32`, `cardinality.ts:24`, `code-facts.tsx:48` | For clinicians the plain type name and cardinality in words ("Required, once"); the technical pair and binding strength under "For modellers", open for architects and terminologists. | S to M |
| P5 | A nurse must agree or object to codes she cannot judge, and is not done until she does. Rating has "Unable to rate"; details have no equivalent. | `project-tasks.ts` (detail), DT2 | Owner decision: "Leave to the experts" as an answer, or code consent from architects and terminologists only. | M |
| P6 | Hand-off contradicts the home: "nothing more for you to do" next to "Still open: Depth", and a page where every element says "Not settled". | `participant-desktop/respiratory-rate--home.png`, `--handoff.png` | One sentence on what hand-off means for the participant, the agreed model in plain words, one line on what stays open instead of a badge per element. | M |
| P7 | The same thing under different names: "Not sure" and "Unsure" (with the bands in opposite order), "Still open" and "No consensus", "Detail" and "Details", "Elements" and "Element board", "Closes" and "Closing date". | `messages/en.json:274, 1405, 1065, 1351, 804, 1124` | One word each, bands in one order. | S |
| P8 | The participant board is a table whose columns say nothing: Question "Other", Sources "1", CKM "Not linked" in 9 of 9 rows. | `participant-desktop/blood-pressure--board.png` | A list for participants with a signal only when it says something (2026-11-20 finding 8, not built). | M |

### The facilitator's next step

| # | Finding | Evidence | Fix | Size |
| --- | --- | --- | --- | --- |
| F1 | Checklist items name work without leading to it; the phase move is the filled button while items are open; "1 of 3 elements are settled". | `facilitator-desktop/oxygen-saturation--home.png`, `overview-checklist.tsx:268-286, 503-513` | Each item links to its item on the page; the first open item is the filled button; the phase move stays outline and its confirmation lists what stays open. | M |
| F2 | Details for the facilitator: 2,138 pixels, no filled button, the objection the Overview points to near the bottom, Settle looks like Revise. | `--details.png`, `detail-card.tsx:446` | A "To do" list at the top with anchors (address the objection, settle the codes, propose a structure, propose the tree), the first one filled; settled parts folded. | M |
| F3 | Finished phases stay editable: Scope forms and two filled buttons in discover and later, "New round" in detail, an import invitation on Models; new round says "elements without consensus are selected" next to "0 of 4 selected". | `facilitator2-desktop/body-temperature--scope.png`, `rounds/index.tsx:79`, `rounds/new.tsx:81` | A facilitator column in `phase-access.ts`: after its phase a page reads as a recap, with editing behind a text link. | M |
| F4 | Hand-off is a title, six equal download cards and the detail recap; the Overview in hand-off is one button to it. | `facilitator2-desktop/respiratory-rate--handoff.png`, `handoff.tsx:43-54` | Hand-off as the Overview of that phase: a status line with links back, the decision report as the primary download, one sentence on what happens next. | M |
| F5 | Scope is text with little to do: a description under the title, help under idle fields, the add-source form always open, use cases as one string with semicolons, the model type unflagged when missing, and a recap that repeats the page. | `--scope.png` (315 words, 1,732 pixels), `scope.tsx:141`, `field-a11y.tsx:67` | Use cases as a list; "Add source" in a dialog; model type as a scope checklist item; from discover on the Scope tab is the recap. | M |
| F6 | Tables for one row and buttons that repeat: rounds as a one-row table where two links go to the same page, a panel table that says "Meets the minimum" three times, 18 Rename and Remove buttons on People. | `--rounds.png`, `--settings.png`, `--members.png` | Rounds as a list; the panel as one line until a row fails; a menu per group. | S |
| F7 | Settings save per block ("Save setting", "Join group"), against one save bar per page (2026-11-20 finding 10). | `facilitator-settings.tsx:88,164,269` | Save on change. | S |
| F8 | The activity log shows raw ids as subjects ("detail_proposal 5ac6…"). | `activity-log.tsx:36,125` | Name the subject (element, round, proposal). | S |

### Consistency and the type scale

| # | Finding | Evidence | Fix | Size |
| --- | --- | --- | --- | --- |
| C1 | Page titles are 20 pixels (`PageHeader level={2}`, 140 pages); the scale has 18 and 24. | `route-states.tsx:37` | 24 for page titles, 18 for admin sections. | S |
| C2 | Status badges (12/500), small buttons (12.8/500) and comment dates, board hints and rating reasons (12) are under 14. | `ui/badge.tsx:12`, `ui/button.tsx:31`, `comment-thread.tsx:100`, `question-board.tsx:102,266,335`, `round-tables.tsx:107` | 14 for all of them. Badge and button are shadcn files, which CLAUDE.md lets us edit only for a defect or an accessibility fix (owner decision). | S |
| C3 | Weight 500 on 97 pages, nearly all from shadcn buttons, labels and table heads; 15/600 on board headings. | `ui/button.tsx:12`, `ui/label.tsx:15`, `question-board.tsx:323` | Either allow 500 for controls in the rule or change four ui files (owner decision); 16 for the board headings. | S |
| C4 | Two filled buttons on Scope ("Add source", "Add comment"). | `--scope.png` | Covered by F5. | S |
| C5 | Rules that disagree with each other: "no description under a page title" and "at most one intro line" (14 pages have a description); "help only on focus" while help on focus would move the controls below. | CLAUDE.md UI section | Owner decision on both rules; the code follows. | S |
| C6 | English dates in US order ("November 25, 2026") for a British browser. | `rounds/format.ts:22` | Day, month, year in English too (owner decision). | S |

### Accessibility

| # | Finding | WCAG 2.1 | Fix | Size |
| --- | --- | --- | --- | --- |
| A1 | The axe failures (settings and administration, on a phone): tables that scroll sideways on a phone have no focusable element (activity log, panel table). The same risk in four other tables. | 2.1.1 | `tabIndex={0}`, `role="region"` and a label on the table container (`ui/table.tsx:13`, an accessibility fix). | S |
| A2 | Ticking "Refers to another model" adds two fields. In a brainstorm column the input moves up about 150 pixels; in the element dialog the vertically centred dialog grows and recentres, and in edit mode the data type field disappears. | layout rule, 3.2.2 spirit | Anchor `BoardDialog` to the top; keep the column's card area from shrinking; replace the data type field with a note instead of removing it. | S to M |
| A3 | No focus move after a client-side navigation: focus stays on a link that is gone and falls to `body`. | 2.4.3 | Focus `main` (it has `tabIndex={-1}`) or the page heading in the router's `onResolved`. | M |
| A4 | Picking a card on the grouping board inserts a "Move here" button above every list, so every list and the picked card move down about 44 pixels; cards block scrolling on a phone; a cancelled touch drops the card. | layout rule | Reserve the slot or put it after the list; allow vertical panning; ignore `pointercancel`. | M |
| A5 | On a phone the project tabs scroll in their own strip and the current tab can sit out of view; row actions in wide tables are cut off without a cue. | 1.4.10 (tables exempt) | Scroll the current tab into view; results and the board as a list per element at 390 pixels. | S to M |
| A6 | The brainstorm intro refers to "the dashed cards" even when there are none, and names them by shape. | 1.3.3 | Pick the sentence by whether imported cards exist; name the "From models" label. | S |

Passes worth keeping: every error message is tied to its field and focus
moves to the first invalid one; status never relies on colour; the keyboard
path on the grouping board works and announces moves; `FormDialog` returns
focus to its trigger.

### Bugs found on the way

- "Review skipped by the facilitator:" with nothing after the colon, for
  participants and architects (`details/queries.ts:429`, `detail-card.tsx:507`).
- "1 of 3 elements are settled" (grammar).
- Recap pages mark both the Overview tab and the recap's phase step as
  current (`project-header.tsx:88-92`).

## The model tree against openEHR and zib 2.0

The tree nests groups in groups without a depth limit, places elements at
any depth, gives every group a cardinality and can mark a group as a
sub-block with a link to an existing block. That covers CLUSTER within
CLUSTER in the openEHR reference model (`CLUSTER.items` is an ordered list
of CLUSTER or ELEMENT, RM data_structures) and the sub-blocks of zib 2.0
(principle P2.6 of *Architectuur zibs 2.0* v1.0).

| Feature | openEHR | zib 2.0 | cdm-plenum | Verdict |
| --- | --- | --- | --- | --- |
| Groups in groups, elements at any depth | Yes | Implied by P2.6 | Yes | No gap |
| A repeating group | `occurrences` | Not stated | Group cardinality | No gap |
| Order of groups | Ordered | Not stated | Kept | No gap |
| Order of elements within a group | Ordered (`CLUSTER.items`) | Not stated | Not kept: creation order (`tree.ts:107`) | **Gap to close** |
| A reference to a whole model | Slot | P3.2 | Reference element (EL26) | No gap |
| A slot that allows several archetypes | `includes`/`excludes` | No | One link | Out of scope: an authoring constraint |
| Time series (HISTORY, EVENT, state) | In OBSERVATION | No | None | Out of scope: follows from the model type at hand-off |

The fix: a position per element in the tree proposal, copied on settling,
with move up and down in the tree form. DT6 should name what the tree does
not record (time structure, slot constraints), so a modeller knows to add
them. The zib 2.0 architecture document does not state depth or cardinality
of sub-blocks; those rows rest on inference.

## FHIR import

The sources are the right ones: R4 core holds the vital signs profiles
(`http://hl7.org/fhir/StructureDefinition/bp`, `.../heartrate`), and the
Nictiz packages hold the zib profiles
(`http://nictiz.nl/fhir/StructureDefinition/zib-BloodPressure`,
`.../zib-HeartRate`). Two defects keep them out of reach, both checked
against the live registry on 2026-11-25:

1. **zib2020 and nl-core cannot be found.** Every version of
   `nictiz.fhir.nl.r4.zib2020` and `nictiz.fhir.nl.r4.nl-core` is a
   prerelease, and the catalogue leaves prereleases out unless asked:
   `https://packages.fhir.org/catalog?name=zib2020&fhirversion=R4` returns
   `[]`, the same with `&prerelease=true` returns the package. Our search
   does not ask (`fhir/client.ts:375`).
2. **R4 core is refused as "not R4".** `hl7.fhir.r4.core` 4.0.1 names its
   version in `fhir-version-list`, the older name of `fhirVersions` according
   to <https://hl7.org/fhir/packages.html>; `isR4` reads only the new name
   (`fhir/client.ts:114`).

Searching for a concept cannot work as such: the catalogue matches package
names, and a concept is a profile inside a large package (`bp` is entry 159
of 196 in core, in a list without a filter). The smallest fix: ask for
prereleases, read `fhir-version-list`, add a filter field above the profile
list, and show the four packages EL10 names as quick picks. A search by
canonical URL does not find the R4 zib profiles and is not recommended.

## Lessons from the GNOME HIG

The owner asked what the GNOME Human Interface Guidelines
(<https://developer.gnome.org/hig/>, read on 2026-11-25) offer this app.
Most findings above have a named pattern there. The ones that fit:

- **One subject per view, reached by browsing** (navigation and browsing
  pages): "Each view should have a clear focus or subject", "don't pack too
  much in", hierarchies of "one level of depth", back at the top left. For
  Details this means a list with one row per element (its status and your
  answer) that opens a view of that element, instead of one page with every
  element in full. Progress shows in the list; the element view says what
  it asks.
- **Three to five top-level views** (view switchers): the facilitator has
  seven tabs, and on a phone the current one scrolls out of sight. A
  grouping such as Overview, Model (Elements and Details), Rounds, and
  People with Settings fits in five. This revises the fixed tabs of
  ADR 0019 and needs a new ADR when it is built.
- **The suggested action is the next step in a process** (buttons): one per
  view, which on the Overview is the first open item, not the phase move
  (F1).
- **A banner for a persistent state** (banners): a finished phase shows "This
  phase is finished" with one "Edit anyway" button above a read view (F3).
- **Placeholder pages that guide** (placeholders): an empty state gets a
  heading that says what is missing and how to change it, and the action if
  there is one. The done state of a step page is the same pattern: "You are
  done", what happens next, the way back (P1).
- **Undo instead of confirmation** (principles, dialogs, toasts): removing a
  source, a group, a comment or a link happens at once with an Undo toast.
  Closing a round keeps its confirmation, as it cannot be undone.
- **Settings and editable lists as rows** (boxed lists): one control per row
  that applies at once, and remove or move in a menu per row. This answers
  F6, F7 and the Rename and Remove buttons on People.
- **Type by role** (typography): a few named styles by purpose (page title,
  section heading, body, caption) defined once in `app.css`, and "minimize
  sizes and weights". Components use the roles, not pixel sizes, so C1 to C3
  cannot drift back.
- **The user's own words, short** (writing style): "Use the user's domain
  terms, not system terms" (P4) and "Keep text short and to the point" (F5).
- **Inline before a dialog** (dialogs): "Action dialogs ... obscure the
  parent window; inline controls are often better." Adding an element inline
  in its column or list also removes the jump of A2.

Not taken over: header capitalization (the app writes sentence case, and
Dutch has none), the neutral tone without "you" (the participant is
addressed directly, which helps a clinician more), and buttons that stay
insensitive until a form is valid (on the web that hides the reason; the
app shows the error and moves focus to the field).

## Plan

In order; each step is one or more pull requests that stand on their own.

1. **Quick fixes (S):** FHIR import (two defects, filter, quick picks), the
   bugs above, one vocabulary (P7), the axe failures (A1), the brainstorm
   sentence (A6), and for A2 until step 5 adds elements inline: the element
   dialog anchored to the top and the brainstorm column kept from shrinking.
2. **Where am I, what do I do, when am I done (M to L):** the task bar and
   the done placeholder on every step page (P1), the full task card (P2),
   the current phase step as a link and back links that name their target
   (P3), and at most five facilitator tabs (new ADR).
3. **The facilitator's next step (M):** linked checklist items and the first
   open item as the suggested action (F1), finished phases as a read view
   under a banner (F3).
4. **Detail and hand-off (L):** Details as a list that opens one view per
   element, for every role (P1, F2); plain types and cardinality with a "For
   modellers" part (P4); "Leave to the experts" (P5); hand-off as the
   Overview for the facilitator and a short page for participants (F4, P6).
5. **Scope and the smaller pages (M):** scope (F5), tables and repeated
   buttons as rows with a menu (F6), settings that apply at once (F7), the
   activity log (F8), the participant board as a list (P8), undo toasts for
   removals, and adding elements inline instead of in a dialog (A2).
6. **Baseline (S to M):** type by role (C1 to C3), focus after navigation
   (A3), the grouping board (A4), the phone tables (A5), element order in
   the tree.

## Owner decisions

Decided by the owner on 2026-11-25:

1. **The current phase step links to the phase home** (P3): the Overview
   for the facilitator, the task for a participant. Done steps keep linking
   to their recap; later steps stay plain text. This revises the
   status-only steps of 2026-11-20 for the current step.
2. **"Leave to the experts"** is a third answer on detail proposals (P5),
   next to "I agree" and "I object", like "Unable to rate" in a round. It
   counts as answered; anyone can still object.
3. **Finished phases are read-only for the facilitator** (F3): the page
   reads like its recap, and an "Edit anyway" text link opens the forms for
   corrections.
4. **The type scale** (C1 to C3): the shadcn badge and small button go to
   14 pixels as a readability fix, weight 500 stays allowed for controls
   (buttons, labels, table heads) and the rule says so, and page titles go
   from 20 to 24 pixels.

Still open: the two rules that disagree (C5) and the English date order
(C6).
