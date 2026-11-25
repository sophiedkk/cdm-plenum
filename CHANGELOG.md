<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Changelog

All notable changes to cdm-plenum are recorded in this file. The format
follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and
the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Hand-off page: in the Hand-off phase every member opens a read-only page
  with the agreed model: the tree, each element with its data type,
  cardinality, values and codes, and the references to other models. Parts
  that are not settled and open codes carry a label. The facilitator finds all
  downloads on the same page; participants see no download.
- CSV for Excel: the elements and the ratings can also be downloaded as "CSV
  for Excel with a semicolon", for Excel in Dutch and other European
  languages, which opens a comma file as one column. Both files keep the same
  rows and the same encoding.
- Decision report: the Export page offers "Decision report", a Markdown file
  with the scope statement, the panel per stakeholder group, the consensus
  rule and response rate of each round, the outcome per element and the
  items that were excluded or merged. It follows the order of the ACCORD
  reporting guideline, includes the detail of each element and marks open
  codes, and shows value rounds as rounds of their own kind. A group of
  fewer than 3 is not named: it is merged into "Other groups". The report
  names no person.
- Value rounds: in the Detail phase the facilitator can put the value list of
  a structure proposal to a rating round. "Rate the values in a round" on an
  element's card adds its values to a draft value round; the values of
  several elements can go in one round, each under its element's name. It
  runs on the Rounds page with the same rating card, scale, results and
  adjustable consensus rule as an element round, and participants rate it
  from "Your turn" during the Detail phase. When the round is closed, "Apply
  to the proposal" turns the values it kept into a new version of the
  proposal, which the group answers again. The round settles nothing itself.
  While a value list is in a round, its proposal cannot be revised or
  settled. The Overview checklist shows a running value round.

- The tree of the model: in the structure step of the detail phase, an
  architect or the facilitator proposes the tree. Groups nest, each has a
  cardinality, a group can be a sub-block (reusable, optionally linked to an
  existing sub-block by title and link) and an element can be a registration
  element, such as an identifier, a start date or an author. Discover's groups
  are the starting point. The group answers by consent as for the structure of
  an element: agree or object with a reason, a revision is a new version, and
  earlier objections stay readable. Settling copies the tree onto the groups
  and elements. A round shows a heading per group at the top of the model. The
  elements CSV has the columns `group_path`, `group_cardinality`, `group_sub_block`
  and `registration` before the round columns.

- Elements that refer to another model: when you add an element on the
  brainstorm board or the Elements tab, tick "Refers to another model" and
  give the model's title, such as a zib, an archetype or a profile, with an
  optional link. The element stands for that whole model. The board, the
  first look, the rating card and the round results name the model under the
  element, and it is rated with the same question as any other element. In
  the detail phase it gets a cardinality only: no data type, values or codes.
  The CSV export has the columns `refers_to` and `refers_to_url`, and the
  mind map links the element to its model.

- Model type: on the Scope page the facilitator chooses what kind of model
  the project builds: an observation, an evaluation, an instruction, an
  action or a sub-block that other models reuse. Each type has a one-line
  explanation. Participants read the choice on the Scope page and in the
  scope recap. The type can change until the project leaves Discover. Every
  type starts with the same four groups as before.

- Base model: in the table of existing models, the facilitator marks one
  model as the base with the "Base model" button in its column. Its column
  moves first, rows it lacks say "Not in the base", and an element put on
  the list takes its name from the base model. Press the button again to
  unmark it.

- Sign in without e-mail when you run the app locally: the development stack
  has a page at `/dev/sign-in` that lists every active account with one
  button each, and "Switch person" in the menu under your name opens it
  again. You no longer need a link from Mailpit or a private window per
  role. The page exists only with `DEV_SIGN_IN=true`, and the app refuses
  that setting unless it runs on `localhost`.

- Codes in the detail phase: once an element's structure is settled, a
  member of a terminology group or the facilitator proposes its codes on the
  Details tab: an element code, a binding strength (required, extensible,
  preferred or example) with an optional value set URL, and a code per value.
  Pick SNOMED CT or LOINC, or type another code system's URI. A second
  terminologist approves the proposal or sends it back with a note before the
  group answers it; with no second terminologist, the facilitator skips the
  review and gives the reason. Settled codes go onto the element, the CSV
  export has columns for them and marks open codes, and the Overview counts
  the elements with settled codes. Revising a settled structure reopens its
  codes.

- Detail phase: after the rounds, a project moves on to Detail, before
  hand-off. On the new Details tab, the facilitator or a member of an
  architecture group proposes the data type, cardinality and value list of
  each element in the model, starting from the existing models it is linked
  to and the flags raters set. Participants answer each proposal with "I
  agree" or an objection with a reason, from "Your turn" on the project home.
  The facilitator marks each objection addressed with a note and settles the
  proposal, which puts its structure on the element. A revised proposal asks
  everyone again. The Overview follows proposals, open objections and settled
  elements, and the board, the element form and the rating card show data
  type, cardinality and values from this phase on.

- Existing models: the facilitator adds openEHR archetypes from CKM, FHIR
  profiles from a package, and other sources such as a form, then compares
  them in one table with a column per model. Check the elements you want and
  choose "Put on the list"; each becomes one element linked to every model
  that has it. Elements with the same code share a row. Elements matched by
  a known mapping or a similar name share a row as a suggestion, with each
  model's own name shown; choose "Not the same" to split it into a row per
  model. Participants' suggested sources wait on the same page to be
  accepted or dismissed. The Overview's first discover item opens the page.
- First look: once elements from existing models are on the list, each
  participant goes through them one at a time and answers whether the element
  belongs to the concept: Belongs, Not sure or Does not belong. Your answers
  are your own; the facilitator sees only the count per answer, in a column
  per answer on the element board. "Your turn" on the project home starts
  here, and the Overview shows how many participants are done, with the
  reminder e-mail now pointing to the first look.
- Participants can suggest an existing model, with a title and a link, from
  the brainstorm board.
- Grouping: every element starts in a group. One you added starts under its
  brainstorm question; one from an openEHR archetype by its place in the
  archetype (data, state, protocol); one from a FHIR profile under the
  measurement; others, such as CSV rows, start in "Not grouped yet". The
  facilitator moves elements by dragging them, with a mouse or a finger, or
  by clicking one and choosing "Move here", and can rename and add groups.
- Check the groups: once the facilitator asks, each participant marks an
  element "Same as…" or "Belongs elsewhere" and says per group what is
  missing. The facilitator sees the remarks per element and group, without
  names; other participants do not see them.
- Groups in the rounds: the rating card names each element's group, and the
  overview of your ratings lists them under group headings. Each participant
  sees the groups in an order of their own, the same during the whole round.
  The results of a closed round list the elements under the same headings,
  in the facilitator's order of the groups.
- Phase recaps: a finished phase in the project header opens a read-only
  recap. Scope shows the statement and its sources; Discover shows how many
  elements went into round 1 and where they came from, the merged
  duplicates and the groups; Decide shows the rounds and their outcomes. The
  current phase and later phases stay plain steps.

### Removed

- The element board's own "Search openEHR CKM" import of a whole archetype.
  Its button now opens Existing models, where an imported archetype's
  elements get a first look and a group. Linking one element to a CKM
  archetype element stays on the board.

### Changed

- The Overview in the Hand-off phase now leads to the hand-off page, and the
  export URL of a project in that phase leads there too. In the earlier phases
  the facilitator keeps the Export page.
- A server function that fails now writes one line to the server log with
  the function name, the error class, the message and the stack, so a
  missing migration shows up in the log. The log never holds the input of
  the function, so no rating, element text or name ends up in it.

- The link in the sign-in e-mail opens a page with one "Sign in" button.
  Pressing it signs you in. A mail scanner or link preview that opens the
  link no longer uses it up before you do.
- A session ends after 7 days without use, and at the latest 30 days after
  you signed in, however often you use the app. After that you sign in
  again with a new link.
- The brainstorm is a board with one column per question. Elements from
  existing models show dashed in their column, your own elements are
  marked, and before the reveal other people's elements show only as a
  count per column. Type in a column and press Enter to add an element
  under that question. A strip above the board shows how many people have
  added elements. Elements from existing models are visible to everyone
  from the start, also on the element board.
- The facilitator's discover checklist follows the parts of the phase:
  start from existing models, let participants take a first look, add what
  is missing, then reveal and clean up. The item that linked to the CKM
  search is gone; the existing models page replaces it.
- Every page, from the projects list to each page of a project and the
  administration, uses one column of the same width with the same left edge.
  The project name, the back link and the page title no longer move when you
  go from one page to the next.
- The phases in the project header show where the project stands (done, now,
  later). The current phase is no longer a link: a participant starts the
  current work from the project home, which now also links to the scope and
  the element board under "In this project"; the newest round results stay
  linked from "Decided so far". A finished phase opens its recap.
- Data type, cardinality and values no longer show anywhere until the detail
  phase, where you will set them: not on the element board or in an
  element's details, not in the facilitator's edit form, and not on the
  rating card. Participants can no longer flag those details while rating,
  and a round's page no longer lists flagged details. Values you entered
  before are kept and come back with the detail phase.
- The element board shows each element's CKM link from the discover phase
  on, when the group links elements to existing models, instead of from
  decide.

### Fixed

- Every date and time in the app is shown in your browser's time zone with
  the zone named, such as "November 25, 2026 at 14:00 GMT+1". The app stores
  your time zone in a cookie, so pages load with the right time. Only the
  first page in a new browser shows UTC for a moment.
- The close button of a window reads "Sluiten" in Dutch instead of "Close".
- The response rate of a closed round no longer changes when a participant
  leaves the project later. A closed round counts the participants who were
  in each group when it closed; an open round counts the current ones.
  Participants who left before this fix are not restored.

## [0.2.0] - 2026-11-20

### Added

- A Settings page for the facilitator, the last tab of a project. It holds
  the change class and the minimum panel (moved from Rounds), the private
  brainstorm and whether participants see group names (moved from Members),
  and joining a stakeholder group to rate. Rounds still shows the panel when
  you set up and open a round.
- A menu under your name in the top bar holds the language, the theme and
  Sign out.

- After the reveal, in the discover phase, you can mark an element on the
  board with "I support this", or say it is the same as another element with
  "Same as…". Other participants never see your marks. The facilitator sees
  a Support column with the number of supporters and a "Possible duplicates"
  list with the number of marks per pair, never who marked; each pair opens
  the merge with both elements chosen. A mark decides nothing by itself. When
  a similar-name hint shows in the brainstorm, "Same as this" supports that
  element instead of adding what you typed.
- A theme switch next to the language switch: Light, Dark or System. System
  follows your device's setting, as before; the choice stays in your browser.
- A new project starts with a private brainstorm: each participant sees only
  the elements they added, until the facilitator selects "Reveal the board"
  on the element board. Until then the board shows the facilitator how many
  participants added elements, and the confirmation lists the count per
  participant. After the reveal everyone sees every element, still without
  the name of who added it. The facilitator can switch the private step off
  on the members page, before the reveal only. Elements added by different
  people can be merged only after the reveal. Existing projects keep their
  shared board.
- The Brainstorm tab asks four questions: what you record or measure, what
  about the patient you need to know to interpret it, how it was measured,
  and in which situation it is recorded. Under each question you add an
  element with a name and one optional line; press Enter to add the next one.
  Data type, cardinality and values stay on the element board, which "More
  details" opens at that element.
- After the reveal, the Brainstorm tab lists up to 5 elements with a similar
  name while you type, each with a link to the element on the board, so you
  can comment there instead of adding a duplicate.
- Round 1 ends with an open question: "Is an element missing? Propose it".
  You give a name and a one-line description, can propose several elements
  and delete your own until the round closes. Other participants never see
  your proposals. The facilitator sees them on the round page, with your
  name only when the round lets the facilitator see who rated what.
- When setting up round 1, the facilitator writes the rule for adding
  proposed elements, prefilled with "Proposed by at least two
  participants". Participants see the rule on the rating screen, and it
  cannot change once the round is open.
- On the round page the facilitator adds a proposal to the board with "Add
  to the board". The new element shows the source "Round 1 proposal".
- A project now opens on an overview. It shows the four phases as steps,
  with the current one marked "now". As a participant you see one task for
  the current phase, such as "Rate round 2" with "12 of 40 rated" and the
  closing date in your time zone, and one button that takes you there. When
  there is nothing to do, the overview says so.
- As a facilitator you move the project to the next or the previous phase
  from the overview, after a confirmation. The overview also shows the
  number of elements on the board, or how many raters completed the open
  round.
- While rating, you can flag the data type, the cardinality or the values of
  an element as wrong. Open "Data type, cardinality and values (not rated)"
  on the card, select "Flag as wrong" next to the detail and give a reason.
  You can change or remove your flag until the round closes. Only the
  facilitator sees flags: the round page lists, per element, how many
  participants flagged each detail and their reasons, with names only when
  the round lets the facilitator see who rated what.

### Changed

- As a participant, a project opens on its home page. A "Your turn" card
  says what to do now, with its facts and one button, such as "Start
  rating"; when nothing waits, one line says so. From the decide phase,
  "Decided so far" shows which elements are in the model, not in it, still
  open or not rated yet, with a link to the newest round results. The
  stakeholder groups and "Leave project" sit under "About this project" at
  the bottom. There are no tabs: the phase steps at the top open the scope,
  the elements and the round, and every other page has a link back to the
  project.
- As a facilitator, a project opens on Overview, the first of six tabs that
  keep their order in every phase: Overview, Scope, Elements, Rounds, People
  and Settings. Overview lists what to do before the next phase, with a
  check on what is done, such as revealing the board or reviewing likely
  duplicates, and a "Send a reminder" to participants who added nothing
  yet when the server can send e-mail. "Go on to" and "Move back to" move
  the project after a confirmation on the page. You add elements on
  Elements; the export is on Overview in the hand-off phase.
- The projects list shows each project's phase and what waits for you there
  with its closing date, such as "Rate round 2, 2 elements, closes Thu Nov
  26", or "Nothing for you now". Projects with something waiting come first.
- On the rating screen the question sits right under the element, in large
  type. Your score from the previous round shows on one line, and "How the
  group scored" opens the group's scores and reasons below it. The reason
  field takes the full width under the scale, and its help shows while you
  type. "Element 1 of 2" replaces the dots.
- The top bar shows Projects and Administration only to administrators;
  the app name leads to your projects.
- The People tab shows one table of people per stakeholder group. You
  invite a participant and add a group in a dialog. Only open invitations
  are listed; accepted, expired and revoked ones are under "Earlier
  invitations".
- In the discover phase the element board shows the brainstorm question
  instead of data type, cardinality and CKM; these show from the decide
  phase on. Adding an element asks for a name and a description only. As a
  participant you add elements on the Brainstorm page only.
- The Brainstorm page has one form: choose the question, type a name and
  press Enter. Your elements show below it, grouped by question.
- A participant who opens the export page lands on the project home, no
  longer on Scope.
- Shorter texts on the project pages; the CSV help on the export page is
  folded.
- The rating card shows the scale as large buttons, grouped in the round's
  three bands with a label under each: does not belong in the model, unsure,
  belongs in the model. "Unable to rate" stands apart. A chosen button is
  filled and has a check mark, and "Saved" now names the score.
- In round 2 and later, the card marks your own earlier score: an outline and
  "you" on its bar in the distribution, and "Round 1: 6" above its button.
  The first three reasons of the earlier round show on the card, with "Show
  all" for the rest; the median and band shares stay under the details.
- Next to "Element 3 of 8" a dot per element shows which ones you rated.
  Select a dot to go to that element.
- Keys on the rating card: 1 to 9 choose a score, U chooses "unable to
  rate", N goes to the next element and P to the previous one. They do
  nothing while you type in a field.
- The top of the rating page is shorter: it no longer explains the bands,
  and "Your ratings are anonymous" sits on the status line.
- `pnpm db:seed-demo` loads one demo project per phase: Body temperature in
  scope, Heart rate in discover with a private brainstorm not yet revealed,
  Blood pressure in decide and Respiratory rate in hand-off with two closed
  rounds. A database that already has the blood pressure demo gets the other
  three.
- You now rate one element at a time. Each card shows the element's name and
  description, your score and the scores of the previous round, the scale
  and a reason field, and says where you are, such as "Element 3 of 8". Use
  "Previous" and "Next" to move between cards; after the last card an
  overview lists every element with your rating or "Not rated yet", and you
  select an element to go back to its card. A reload or the browser's back
  button keeps you on the same card. In round 1 the question "Is an element
  missing? Propose it" is on the overview.
- A rating now answers one question: does the element, by its name and
  description, belong in the data model. The data type, cardinality and
  values are folded away on the card and marked "not rated"; they are
  settled in a later step.

- The element board shows each element as one row of a table, with its
  number, name, description, data type, cardinality, number of sources, CKM
  link and number of comments. At 1280 by 800 pixels you see at least 10
  elements without scrolling. Select an element's name to open its details
  below the row: the full description, proposed values, sources, CKM link,
  comments and the facilitator's actions (Edit, Edit values, Link to CKM).
- "Merge duplicates" and "Import CSV" moved into the "More actions" menu
  next to "Search openEHR CKM" on the element board.
- The rating question now asks whether an element belongs in the data
  model, for any use case in scope: the model holds every element that one of
  those use cases needs, whichever standard implements it later. The scale
  reads 1 to 3 "does not belong in the model", 4 to 6 "unsure" and 7 to 9
  "belongs in the model". The scale and the consensus rule stay the same.
- The outcomes of a round read "In the model", "Not in the model" and "No
  consensus". An element that is not in the model stays on the board and in
  the elements CSV.
- The results of a round show one row per element: the outcome, the median,
  a small chart of the scores and the number of answers. "Details" opens
  every score, the share in each band and the result per stakeholder group.
  Eight elements fit on a 1280 by 800 screen.
- When you rate a later round, each element shows your own score from the
  previous round and the scores of everyone and of each stakeholder group of
  3 or more, in one line above the scale. The median, the bands and the
  reasons are under "Details and reasons". The rating screen no longer shows
  whether an element was included, excluded or without consensus in the
  previous round, so that label does not push your rating.
- The page of an open round starts with your progress and the "Rate round N
  now" button, followed by the rule and the anonymity statement in short.
  The full setup and the panel at opening are under "Setup of this round".
  The facilitator sees the response as one line, with the table per
  stakeholder group under a disclosure.
- The demo project of `pnpm db:seed-demo` is now in the decide phase, since
  its second round is open.
- Participants see only the steps of the current phase. In scope they see
  Overview, Scope and Members and can comment on the scope. In discover the
  Brainstorm tab and the element board appear: participants add elements and
  comment on them, and the scope becomes read-only. In decide the Brainstorm
  tab goes, the board becomes read-only and the Rounds tab appears for rating.
  In hand-off every earlier step stays readable. A read-only step shows "This
  step is closed" where its comment form or add button was, and a link to a
  step that has not started leads to the project overview.
- The facilitator sees every tab in every phase and can prepare ahead: edit
  the scope, add or import elements and set up a round. A round opens in the
  decide phase only, the board is revealed by hand in the discover phase only,
  and the project cannot leave the decide phase while a round is open.

### Fixed

- Comments no longer show "By a former member" for people who are still in
  the project. As a participant you see "By you" on your own comments and
  "By a participant" on the others; the name stays hidden.
- The keys line under the rating scale is hidden on touch screens without a
  mouse, such as phones.
- Every date and time reads the same way, with the time zone named, such as
  "November 26, 2026 at 22:05 CET". Comments used a shorter format before.
- The activity log on the administration page shows the project's name and
  the action in words, in English or Dutch, 25 entries per page with
  "Previous" and "Next". It logs the same as before.
- The button that searches CKM is called "Search openEHR CKM", so you know
  which model it searches.

## [0.1.0] - 2026-11-19

The first release: scope, element board with the CKM reuse check, e-Delphi
rating rounds and the CSV and mind map exports.

### Added

- `pnpm db:seed-demo` loads a demo project on blood pressure into a
  development database: a scope, eight elements, eight invented participants,
  a closed first round with results and an open second round.
- A facilitator can let participants see who is in each stakeholder group.
  It is off by default, and it never shows e-mail addresses, authors or who
  gave a rating.
- A facilitator can join one stakeholder group on the members page and rate
  in rounds. Their ratings count in that group's results, the response rate
  and the minimum panel.
- When you merge duplicate elements, the board shows the CKM links of the
  merged duplicates under "Also linked via merged duplicate", next to the
  kept element's own link. The elements CSV has a new `merged_ckm_links`
  column listing these links as `archetype_id at_code (revision)`.
- The scope page shows the concept, use cases, what is out of scope and the
  ordered sources. The facilitator edits the texts and adds, moves and
  removes sources with buttons. Every member can comment; only the
  facilitator sees who wrote a comment.
- On the element board, every member adds elements with a name,
  description, data type (openEHR and FHIR type side by side, with when to
  use each), cardinality and source note, and comments on them. Participants
  never see who added an element or wrote a comment.
- The facilitator edits elements, merges duplicates, sets proposed values for
  coded text, ordinal and scale elements, imports elements from a CSV file
  after a preview of accepted and refused rows, and searches CKM to link an
  element or import all elements of an archetype. CKM failures show as
  messages and the board keeps working.
- The members page: facilitators add, rename and remove stakeholder groups,
  invite participants by e-mail into a group, copy an invitation link to pass
  on, and revoke invitations. Participants see each group with its expert
  type and number of participants.
- Participants can leave a project; their ratings in closed rounds stay in
  the results.
- The administration page: grant and revoke the administrator and facilitator
  rights by e-mail address, deactivate and reactivate accounts, and read the
  activity log filtered by action. The log records each sign-in.
- Facilitators set the change class and the minimum panel per expert type,
  and see the panel next to the minimum.
- Facilitators set up a rating round with its elements, scale, consensus
  rule, closing date and whether they may see who rated what, and open it,
  with a reason when the panel is below the minimum.
- Participants rate each element on the scale or choose "unable to rate",
  with an optional reason; each answer saves at once. In later rounds they
  see their earlier rating, the group result and the anonymous reasons.
- After the closing date, facilitators close a round. Everyone then sees
  each element's outcome, median, band percentages and full distribution, and
  results per stakeholder group of 3 or more.
- Facilitators see the response rate per stakeholder group, and who rated
  what when the round allows it.
- Facilitators download the elements CSV, the mind map and the anonymised
  ratings CSV from the export page, with a hint for opening CSV files in a
  Dutch spreadsheet program.
- After signing in you see your projects with your role and the phase of
  each project. A person with the facilitator right creates a project from
  there and lands on its scope page.
- Each project page shows the project name, its phase and your role, with
  links to the scope, element board, rounds, members and (for facilitators)
  export pages.
- Every page has a header with the main navigation, your name, a language
  switch between English and Nederlands that the app remembers, and sign
  out. Administrators also see Administration. The pages follow the light
  or dark setting of your system.
- A production container image and `compose.yaml` that run the app and
  PostgreSQL on one host behind a reverse proxy, with an operator guide in
  `docs/deployment.md`.
- Browser tests check that the sign-in and invitation pages meet WCAG 2.1 AA
  in English and Dutch and work with the keyboard alone, and that signing in
  through the e-mail link and joining through an invitation work.
- Facilitators can download the elements with their round outcomes as CSV,
  the included elements as a FreeMind mind map, and the anonymised ratings as
  CSV.
- Facilitators set up rating rounds with an adjustable scale, consensus
  rule, closing date and rater visibility, open them, and close them to
  record each element's outcome.
- Participants rate each element, mark it "unable to rate" or give a reason,
  and in a later round see their earlier rating, the group result and the
  anonymous reasons.
- Projects have a change class A to D and a minimum panel per expert type. A
  round below the minimum opens with a reason, and the round keeps the panel
  it opened with.
- Everyone in a project sees closed-round results per element and per
  stakeholder group of 3 or more; facilitators see the response rate per
  group.
- Facilitators write the scope statement (concept, use cases, out of scope
  and an ordered list of sources); every participant reads it and can comment.
- Participants add candidate elements with a name, a description and an
  optional data type, cardinality and source, and comment on them.
  Participants never see who added an element or wrote a comment; the
  facilitator does.
- Facilitators edit an element's wording, merge duplicates (descriptions,
  sources, comments and proposed values move to the element that stays), and
  list proposed values for coded text, ordinal and scale elements.
- Facilitators import candidate elements from a CSV file with `name` and
  `description` columns and optional `data_type` and `cardinality` columns,
  comma or semicolon separated, up to 1 MiB and 1,000 rows. A preview lists
  each refused row with its line number and reason before anything is
  written.
- Facilitators can search CKM, link a candidate element to an element of a
  CKM archetype and import all elements of an archetype as candidates. A link
  records the archetype ID, revision and at-code.
- Set `CKM_BASE_URL` to use another CKM; the international CKM is the default.
- A first web app with a home page in English and Dutch, chosen from your
  browser's language, and a health check at `/api/health`.
- A development stack that runs with `podman compose`: the app, PostgreSQL
  and Mailpit.
- Sign in with a link sent to your e-mail address, at `/sign-in`. The link
  works once and expires after 5 minutes. You can sign in for the first time
  only with an invitation or a grant from an administrator.
- Invitations: a facilitator invites an e-mail address into one stakeholder
  group of a project. The invitation link at `/invite/<id>` expires after 48
  hours and works once; signing in accepts it and adds you to the project
  and the group.
- Projects start with nine stakeholder groups, each a clinical, terminology
  or architecture group, named in your language. The facilitator can add,
  rename and remove groups.
- `pnpm admin:grant <email> [--facilitator]` and `pnpm admin:revoke` give and
  take the administrator role or the right to create projects, from the
  server's command line.
- E-mail over SMTP when you set `SMTP_URL` and `MAIL_FROM`. Without SMTP,
  the facilitator copies the invitation link and passes it on.
- Setting the project's own minimum panel needs a reason, which the panel
  setup shows next to the class defaults.
- Up to 30 sign-in link requests, and 30 link openings, per minute per
  network address, so a class behind one address can sign in together.
- A deactivated account cannot sign in, and its open sessions end at once.

[Unreleased]: https://github.com/sophiedkk/cdm-plenum/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/sophiedkk/cdm-plenum/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/sophiedkk/cdm-plenum/releases/tag/v0.1.0
