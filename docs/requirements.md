<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Requirements

> **Status: working draft.** These requirements are a first proposal, written
> before any code. Priorities, acceptance criteria and the requirements
> themselves change after review with the owner and after the first sessions
> with a group. When a requirement is unclear, missing, or conflicts with what
> is being built, raise it with the owner instead of implementing it as
> settled.

cdm-plenum guides a group of clinicians, information modellers and
terminologists through the early phase of developing a clinical data model:
from the scope of a concept to an agreed list of data elements. It hands that
list to the existing authoring tools and to review in the openEHR Clinical
Knowledge Manager (CKM). It does not author ADL and does not run CKM review
rounds.

Each requirement has a stable ID. Code, tests, issues and pull requests cite
these IDs (for example `EL3`, `Q-ANON-1`). An ID is never reused: a dropped
requirement keeps its row with the status "Dropped".

## How to read this

- **Priority** uses MoSCoW: Must, Should, Could, Won't. Must is the first
  working version (the MVP).
- **Acceptance criterion** is the test that shows the requirement is met, in a
  demo or an automated test. Every criterion is *(proposed)* until the owner
  confirms it.
- **Risk** refers to the [risk table](#risks).

## Terms

| Term | Meaning |
|---|---|
| Project | The work on one candidate concept, for example "blood pressure" or "anxiety (nursing focus)". |
| Scope statement | The concept, its use cases, what is out of scope, and the source documents of a project. |
| Candidate element | A proposed data element on the element board, with a name, a description, a proposed data type, a cardinality, its source and an optional link to an existing CKM archetype element. |
| Data type | One of the openEHR Reference Model data value types in the [data type list](architecture.md#element-data-types), each with its nearest FHIR data type. |
| Stakeholder group | A group of participants with the same background, for example "nurses", "physicians" or "modellers". Results are shown per group. |
| Expert type | The kind of expertise a stakeholder group brings: clinical, terminology or architecture, after the expert roles in the Nictiz zib management agreements ([Beheerafspraken zib's V1.0](https://www.zibs.nl/images/7/7a/Beheerafspraken_zorginformatiebouwstenen_V1.0.pdf), section "Analyseren"). |
| Change class | How large the modelling work of a project is, A to D, after the "zwaarterubriek" of the same agreements: A no change, B a small change, C a large change, D a large change or a new model. |
| Minimum panel | The number of participants per expert type a project should have before a round opens, set by its change class. A guideline, not a gate (DE12). |
| Round | One period in which participants rate the candidate elements. A round has a consensus rule and a closing date, both fixed before it opens. |
| Consensus rule | The thresholds that decide whether an element is included, excluded or has no consensus, for example "at least 70% score 7 to 9 and at most 15% score 1 to 3". |

## Roles

A role is held per project, except administrator. A person can be facilitator
of one project and participant in another.

Facilitator is also an application-wide right: only a person an administrator
granted it to creates a project, and becomes that project's facilitator (owner
decision 2026-11-19). Revoking the right stops new projects; the projects the
person already runs stay theirs. An invitation never grants the right.

| Role | May | Sees |
|---|---|---|
| Facilitator | create a project, with the right an administrator grants; run their projects; invite participants and assign them to a stakeholder group; edit the scope statement and the element board; set up, open and close rounds; export; rate, after placing themselves in a stakeholder group (DE14) | everything in their own projects, including who took part in a round, never which participant gave which rating |
| Participant | read the scope statement; add and comment on candidate elements; rate in an open round | the projects they are invited to; the group results of closed rounds; their own earlier ratings |
| Administrator | manage user accounts, the administrator role and the facilitator right | accounts and the activity log; no project content unless they also hold a project role |

## Functional requirements

### Projects and participants

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| PR1 | Sign in with an account. An account exists only through an invitation (PR3) or an administrator (AD1). | Must | *(proposed)* A user without an account gets no access to any page except the sign-in page and the invitation page; there is no open registration. | R-01 |
| PR2 | A facilitator creates a project for one concept. Only a person with the facilitator right an administrator granted creates a project (owner decision 2026-11-19). | Must | *(proposed)* The facilitator creates a project with a name and a short description, and becomes its facilitator. A user without the facilitator right is refused, and the refusal is tested. | |
| PR3 | A facilitator invites participants by e-mail address and assigns each to one stakeholder group. | Must | *(proposed)* The invitee gets a single-use invitation link that expires; accepting it creates their account or adds the project to an existing one. A used or expired link is refused, and the refusal is tested. An invited participant sees the project after sign-in; a user who is not invited gets no access to it. Every participant belongs to exactly one stakeholder group of the project. | R-01 |
| PR4 | A project shows its phase: scope, discover, decide, detail, hand-off. | Must | *(proposed)* The project page shows the current phase as a row of steps in text; the facilitator moves the project to the next phase, and the phase decides which task the participant's home shows (PR8, [ADR 0013](adr/0013-participant-task-home-and-compact-views.md)). Raised from Should on 2026-11-20. The detail phase: owner decision 2026-11-20 ([ADR 0014](adr/0014-rate-inclusion-detail-later.md)). | |
| PR5 | A participant leaves a project. | Should | *(proposed)* After leaving, the participant has no access; their ratings in closed rounds stay in the results. | R-04 |
| PR7 | A facilitator chooses whether participants see who is in each stakeholder group. | Should | *(proposed)* A project setting, off by default: off, participants see each group's expert type and number of participants; on, they also see the names. The setting never reveals who wrote an element or comment or who gave a rating (Q-ANON-1). Owner decision 2026-11-19. | R-03 |
| PR6 | Each stakeholder group has an expert type; a new project starts with a default set of groups. | Must | *(proposed)* A new project has one terminology group, one architecture group, and clinical groups for the Nictiz expert areas: general medicine, primary care, mental health care, nursing, medication and allergies, patient, administrative. The facilitator adds, renames and removes groups, and every group keeps exactly one expert type. Owner decision 2026-11-19. | |
| PR8 | A participant opening a project sees what is expected of them now. | Must | *(proposed)* For a participant, the project opens on a task card: the current phase in one sentence, the deadline with its time zone, what they have done as a count (for example "You added 3 elements", "12 of 40 rated") and one main button; with nothing to do, the card says so and names the next date. The tabs stay available for reading. Owner decision 2026-11-20 ([ADR 0013](adr/0013-participant-task-home-and-compact-views.md)). | |
| PR9 | What a participant sees and does follows the project's phase. | Must | *(proposed)* A participant sees the steps of the current and earlier phases and not those of later phases: Brainstorm only in discover, the element board from discover, the rounds from decide; Overview, Scope and Members always. Writing happens only in the current phase: scope comments in scope; adding elements and element comments in discover; ratings, proposals and flags in an open round in decide. The server refuses a participant's write outside its phase, and a read of a step that has not started returns nothing. Owner decision 2026-11-20 ([ADR 0015](adr/0015-phase-bound-access.md)). | |
| PR10 | The facilitator prepares ahead, but an action that reaches participants needs its phase. | Should | *(proposed)* The facilitator sees every step at any time and can import elements or set up a round ahead of its phase. Opening a round is refused outside the decide phase, revealing the board outside the discover phase, and moving the project out of the decide phase while a round is open; each refusal is tested. Owner decision 2026-11-20 ([ADR 0015](adr/0015-phase-bound-access.md)). | |
| PR11 | Every project page shows where the project is and what the person does now. | Must | *(proposed)* The project header shows the project's name, one line of its scope, the five phases as steps with the current one marked in text, and a task line with one main button (the task card of PR8). It replaces the phase and role badges and the Overview tab; the project opens on the current step's page. Owner decision 2026-11-20 ([ADR 0018](adr/0018-simpler-pages.md)). | |
| PR12 | The facilitator changes project settings on a Settings page of their own. | Should | *(proposed)* Change class and minimum panel (DE11, DE13), the private brainstorm (EL13) and group names (PR7) sit on a Settings page that only the facilitator sees; the Members page keeps the stakeholder groups, people and invitations, the Rounds page only the rounds. Owner decision 2026-11-20 ([ADR 0018](adr/0018-simpler-pages.md)). | |
| PR13 | A done phase step opens a recap of that phase. | Should | *(proposed)* In the project header a phase that is done is a link to a read-only recap: for Scope the scope statement and sources, for Discover the number of elements that went into round 1 with where they came from, the merged duplicates and the groups, for Decide the rounds and their outcomes. The current phase step is not a link; its work is on the project home or the Overview. Later phases are not links. Owner decision 2026-11-20 ([ADR 0020](adr/0020-discover-first-look-board-and-grouping.md)). | |

### Scope

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| SC1 | A facilitator writes the scope statement: concept, use cases, out of scope, source documents. | Must | *(proposed)* The scope statement has the four parts; participants can read it but not edit it. | R-02 |
| SC2 | Participants comment on the scope statement. | Should | *(proposed)* A participant adds a comment; the facilitator sees all comments next to the statement. | |
| SC3 | The group accepts the scope by consent, with a review date. | Could | *(proposed)* Participants answer "consent" or "objection with reason"; the facilitator sees the open objections and marks each one addressed. The method follows Sociocracy 3.0 consent decision making (<https://patterns.sociocracy30.org/consent-decision-making.html>). | R-02 |

### Element board

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| EL1 | Participants add candidate elements to the project's board. | Must | *(proposed)* A participant adds an element with a name and a description, and nothing else. Data type, cardinality and values are set in the detail phase (DT1, EL21), where the data type is picked from the data type list, which shows the openEHR type and the FHIR type side by side. Cardinality is a minimum (0 or 1) and a maximum (1, a number, or many). Owner decision 2026-11-20 ([ADR 0018](adr/0018-simpler-pages.md)). | |
| EL2 | Other participants do not see who added an element. | Must | *(proposed)* No page or API response shown to a participant contains the author of an element; the facilitator sees the author. | R-03 |
| EL3 | A facilitator imports candidate elements from a CSV file. | Must | *(proposed)* A CSV with a name and description column adds one element per row; a row without a name is reported and not imported; the file's name is stored as the source. The file is UTF-8 with a header row, comma or semicolon separated, at most 1 MiB and 1,000 rows; `data_type` takes the key or the RM type name and `cardinality` the form `0..1`. | R-05 |
| EL4 | A facilitator links a candidate element to an element of a source model: an openEHR archetype in CKM, a FHIR resource, profile or logical model, or a zib. | Must | *(proposed)* The facilitator searches a source model from the element, picks an element of it, and the link stores: for openEHR the archetype ID, its revision and the at-code (through the CKM REST API, see [External sources](#external-sources)); for FHIR the package, its version, the canonical URL and the element path (EL10); for a zib the NL-CM concept id and the zib version. An element can carry several links. Owner decision 2026-11-20 ([ADR 0016](adr/0016-start-from-existing-models.md)). | R-06 |
| EL5 | A facilitator merges duplicate elements and edits an element's wording. | Must | *(proposed)* Merging two elements keeps both descriptions and both sources on the result; comments of both stay readable. A merge is refused for an element that is already in a round, and when the proposed values do not fit the result's data type. A CKM link on a duplicate stays recorded and is shown and exported as provenance of the result; the result's own link does not change. Owner decision 2026-11-19. | |
| EL6 | Participants comment on an element. | Should | *(proposed)* A comment appears under the element; the author is hidden from other participants as in EL2. | R-03 |
| EL7 | A facilitator imports the elements of a source model as candidates. | Must | *(proposed)* Every element of the chosen CKM archetype, FHIR StructureDefinition (EL11) or zib becomes a candidate linked to that source element (EL4), with its name, definition, type, cardinality, element code and binding kept as the source's details; FHIR infrastructure elements (`id`, `meta`, `extension` and the like) are left out. Raised to Must on 2026-11-20 ([ADR 0016](adr/0016-start-from-existing-models.md)). | R-06 |
| EL8 | *(withdrawn)* Volunteers sort the elements in an open card sort. | Won't | Withdrawn on 2026-11-20 after an evidence check: no study shows that a participant sort before a Delphi helps, and the order of grouped blocks biases ratings. The facilitator groups instead (EL18) and participants check the groups (EL24); see W6 and [ADR 0020](adr/0020-discover-first-look-board-and-grouping.md). | |
| EL9 | A facilitator lists proposed values for an element of a coded type (coded text, ordinal, scale). | Should | *(proposed)* The element holds an ordered list of values, each with a text and, for ordinal and scale, a number; the list appears in the exports. | |
| EL10 | A facilitator searches FHIR packages and links a candidate element to an element of a FHIR resource, profile or logical model. | Must | *(proposed)* The facilitator searches the FHIR package registry for FHIR R4 packages (for example `hl7.fhir.r4.core`, `hl7.fhir.uv.ips`, `nictiz.fhir.nl.r4.zib2020`), opens a StructureDefinition and links an element to one of its element paths (for example `Observation.component.value[x]`). The link stores the package, its version, the canonical URL and the path. An element can carry a CKM link and a FHIR link at the same time. Owner decision 2026-11-19; raised to Must on 2026-11-20 ([ADR 0016](adr/0016-start-from-existing-models.md)). | R-09 |
| EL11 | A facilitator imports the elements of a FHIR profile or logical model as candidates. | Must | *(proposed)* Every element of the chosen StructureDefinition becomes a candidate linked to that element (EL10), with source kind `fhir`, as EL7 does for an archetype. Raised to Must on 2026-11-20 ([ADR 0016](adr/0016-start-from-existing-models.md)). | R-09 |
| EL12 | The facilitator chooses the source models of the project; participants suggest them. | Must | *(proposed)* At the start of discover the facilitator adds source models (FHIR packages and their profiles or logical models, CKM archetypes, zibs through the zib FHIR profiles) and imports their elements (EL7). A participant suggests a source model with a title and a link; the facilitator decides whether to import it. Forms, local data sets and guidelines stay possible as sources with a title and a link. Each element records the sources it appears in, and the board shows in how many (Grinnon et al. 2012, <https://doi.org/10.1177/1740774512438980>; COMET Handbook section 2.7). Owner decision 2026-11-20 ([ADR 0016](adr/0016-start-from-existing-models.md)). | |
| EL13 | In the brainstorm, participants first add elements privately; the facilitator reveals the board. | Must | *(proposed)* A project setting, on by default: until the facilitator reveals the board, a participant sees only their own elements, and the facilitator sees all elements and the count per participant. After the reveal everyone sees every element, without authors (EL2). Owner decision 2026-11-20 (Diehl and Stroebe 1987, <https://doi.org/10.1037/0022-3514.53.3.497>; Kohn and Smith 2011, <https://doi.org/10.1002/acp.1699>). | R-03 |
| EL14 | The add screen guides participants with four questions in clinicians' words. | Should | *(proposed)* The questions ask what is recorded, what about the patient is needed to interpret it, how it was measured (method or device), and in which context it is used; clinical information models separate these parts (for example `data`, `state` and `protocol` in an openEHR OBSERVATION, <https://specifications.openehr.org/releases/RM/latest/ehr.html>), but the questions name no standard. An element stores the question it answered, which the facilitator can use to group it (EL18). No spec governs the wording; our own design. | |
| EL15 | A participant adds an element with a name and one line; the other fields are optional. | Should | *(proposed)* The add form shows a name and a short description; data type, cardinality, sources and values sit behind "More details". After the reveal (EL13), the form lists existing elements with a similar name while the participant types, with a link to mark "same as" (EL16) instead of adding. | |
| EL16 | After the reveal, participants mark an element "I support this" or "same as" another element. | Should | *(proposed)* Both marks are anonymous to other participants (EL2). The facilitator sees the number of supporters and the proposed duplicates, and decides on merges (EL5). A mark never includes or excludes an element; that is the Delphi's task. | R-03 |
| EL17 | Participants see example elements on request. | Could | *(proposed)* A button shows a few elements from the models in the sources (EL12), such as archetypes, profiles or zibs, or, after the reveal, from other participants; the examples never appear unasked (Siangliulue et al. 2015, <https://doi.org/10.1145/2757226.2757230>). | |
| EL18 | The facilitator groups the elements before the Delphi. | Should | *(proposed)* Every element starts in a group: a brainstormed element under the question it was added to (EL14), an imported element by its place in the source model (for an openEHR OBSERVATION `data`, `state` and `protocol` to the measurement, the patient's state and how it was measured; a FHIR profile's elements to the measurement). Elements without a known place, such as CSV rows (EL3), start in "Not grouped yet". The facilitator moves elements between groups by drag and drop, with a keyboard path ("Move here"), and can rename and add groups. The groups appear in the rounds (DE19) and the exports (COMET Handbook section 2.7.1.2). No spec governs the starting place; our own design ([ADR 0020](adr/0020-discover-first-look-board-and-grouping.md)). | |
| EL19 | The facilitator sees whether new sources still add elements. | Could | *(proposed)* A view shows, per source in the order added, how many elements it added that no earlier source had. No source gives a numeric stopping rule; the facilitator decides when the list is complete (COMET Handbook section 2.7.1.1). | |
| EL20 | The facilitator compares the imported source models in a coverage table. | Must | *(proposed)* Imported elements are matched across source models on the same LOINC or SNOMED CT element code, then on a declared mapping (a zib profile to its NL-CM concept), then on a similar name; only a code match is applied, the other matches are suggestions the facilitator confirms or rejects. A suggested row shows each model's own name, and "Not the same" splits it into a row per model (owner decision 2026-11-23). The table has one row per candidate element and one column per source model, each cell showing that model's type, cardinality and binding, or empty when the model lacks the element. No spec governs the matching; our own design ([ADR 0016](adr/0016-start-from-existing-models.md)). | |
| EL21 | The board shows an element's fields from the phase that decides them. | Must | *(proposed)* In discover the board and an element's details show name, description, brainstorm question, sources, links to source models and support; data type, cardinality and values appear from the detail phase, codes and binding from its terminology step. Until the detail phase is added as a phase of its own, between decide and hand-off, data type, cardinality and values are hidden in every phase; the data is kept. A facilitator sees the imported source details in every phase. Links to source models show from discover on. Owner decisions 2026-11-20 ([ADR 0018](adr/0018-simpler-pages.md)). | |
| EL22 | Each participant takes a first look at the imported elements. | Should | *(proposed)* After the facilitator imports source models (EL7, EL12), a participant goes through the imported elements one at a time, sees the models each appears in, and answers "Does this element belong to the concept <name>?" with Belongs, Not sure or Does not belong. The answers are anonymous to other participants (EL2); the facilitator sees the count per answer. An answer decides nothing; the Delphi rates in Decide. Owner decision 2026-11-20 ([ADR 0020](adr/0020-discover-first-look-board-and-grouping.md)). | R-03 |
| EL23 | The brainstorm is a board with one column per question. | Should | *(proposed)* The board shows the four questions of EL14 as columns. Imported elements show in their column, marked as from existing models; a participant's own elements are marked as theirs; before the reveal (EL13) the elements of others show only as a count per column. Typing in a column and pressing Enter adds an element under that question. The board shows how many participants have added elements. Owner decision 2026-11-20 ([ADR 0020](adr/0020-discover-first-look-board-and-grouping.md)). | |
| EL24 | Participants check the facilitator's grouping. | Should | *(proposed)* After the facilitator asks for a check, a participant sees the groups with their elements and marks an element "Same as…" (EL16) or "Belongs elsewhere", and adds per group what is missing. Other participants do not see the remarks (EL2); the facilitator sees them per element and group (COMET Handbook section 2.13.2). Owner decision 2026-11-20 ([ADR 0020](adr/0020-discover-first-look-board-and-grouping.md)). | R-03 |

### Delphi rounds

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| DE1 | A facilitator sets up a rating round on the candidate elements, with a scale, a consensus rule and a closing date. The facilitator can adjust the scale and every threshold of the rule. | Must | *(proposed)* The default is a 1 to 9 scale and the rule "included when at least 70% score 7 to 9 and at most 15% score 1 to 3; excluded when at least 70% score 1 to 3 and at most 15% score 7 to 9; otherwise no consensus" (Williamson et al., COMET Handbook, <https://doi.org/10.1186/s13063-017-1978-4>). The facilitator can change the scale length and each percentage and score band before the round opens. A round cannot open without a rule and a closing date. The rating question asks whether the element belongs in the data model, for any use case in scope: the common data model is a maximal data set, every element a use case in scope needs, whichever standard implements it later (the principle as openEHR states it: Leslie 2014, <https://openehr.atlassian.net/wiki/download/attachments/2949213/2014+07+openEHR+approach.pdf>), not a minimal core set; an excluded element is kept as "not in the model" with its reasons. The wording names no standard. Owner decision 2026-11-20. The rating covers inclusion only: whether the element, by its name and description, belongs in the model. Data type, cardinality and values are not shown on the rating card (EL21) and are settled in the detail step (DT1 to DT3, [ADR 0014](adr/0014-rate-inclusion-detail-later.md)). Owner decision 2026-11-20. | R-07 |
| DE2 | The consensus rule and the closing date cannot change once a round is open. | Must | *(proposed)* After opening, the server refuses a change to the rule or the closing date; the refusal is tested. | R-07 |
| DE3 | A participant rates each element in an open round, with an optional reason. | Must | *(proposed)* A participant saves a rating per element, changes it until the round closes, and can skip an element ("unable to rate"). | |
| DE4 | Ratings are always anonymous to other participants. Whether the facilitator sees who gave which rating is a setting of the round, off by default. | Must | *(proposed)* The setting is fixed when the round opens, and participants see it before they rate. With the setting off, a test reads every response the facilitator gets and finds no participant identifier next to a rating; with it on, the facilitator sees each participant's ratings and other participants still see none. | R-03 |
| DE5 | After a round closes, everyone in the project sees the result per element: the distribution, the median, the outcome under the rule, and the scores per stakeholder group. | Must | *(proposed)* Each element shows its full distribution, not only the median, and its outcome; each stakeholder group with at least 3 ratings has its own distribution (Brookes et al. 2016, <https://doi.org/10.1186/s13063-016-1479-x>). | R-03 |
| DE6 | The facilitator sees the response rate of each round, per stakeholder group. | Must | *(proposed)* The round page shows invited, started and completed participants per group. Invited means joined before the round closed (pending invitations do not count); started means at least one answer; completed means an answer for every element, "unable to rate" included. | R-04 |
| DE7 | A facilitator opens a next round on the elements without consensus. | Should | *(proposed)* The next round carries over the elements with "no consensus"; each participant sees their own earlier rating and the group's distribution next to each element (DE15). | |
| DE8 | Reasons given in a round are shown anonymously in the next round. | Should | *(proposed)* Every reason from round N appears without author next to its element in round N+1. | R-03 |
| DE9 | A participant who moves far from their earlier rating gives a reason. | Could | *(proposed)* A change of 3 or more points on the scale asks for a reason before saving. | |
| DE10 | Element order is randomised per participant. | Could | *(proposed)* Two participants in the same round see the elements in a different order; one participant keeps their own order within the round. | |
| DE11 | A project has a change class, and the round setup shows the panel per expert type next to the minimum panel of that class. | Should | *(proposed)* The facilitator picks the class when creating the project (default D, a new model) and can change it until the first round opens. The round setup lists, per expert type, the participants who have joined and the minimum from the [minimum panel table](#minimum-panel); a shortfall is shown with text, not colour alone. Owner decision 2026-11-19. | R-08 |
| DE12 | A facilitator can open a round below the minimum panel by giving a reason. | Should | *(proposed)* Opening a round below the minimum asks for a short reason and then opens the round; it is never refused for the panel alone. The round stores the panel per expert type at the moment it opened, the minimum that applied and the reason; the round page and the decision report (EX3) show them. | R-08 |
| DE13 | A facilitator adjusts the minimum panel of a project, with a reason. | Could | *(proposed)* The facilitator raises or lowers the count per expert type before the first round opens and gives a reason for the change (owner decision 2026-11-19); the decision report shows the adjusted counts and the reason next to the class defaults. | |
| DE14 | A facilitator rates, as a member of one stakeholder group. | Should | *(proposed)* A facilitator who wants to rate places themselves in one stakeholder group; their ratings then count like any participant's in the overall result, the group result, the response rate and the minimum panel. A facilitator without a group cannot rate. Owner decision 2026-11-19. | |
| DE15 | While a round is open, a participant sees per element their own previous score and the distribution, and no outcome label. | Should | *(proposed)* The rating screen shows the participant's own score from the previous round and the distribution per stakeholder group (Q-PRIV-3 applies), with the median and the band shares behind "details"; it shows no included, excluded or no-consensus label of an earlier round. After a round closes, DE5 applies. Follows the COMET Handbook example (Williamson et al. 2017, figure 3); a label can push ratings toward the group (Barrios et al. 2021, <https://doi.org/10.1016/j.techfore.2020.120484>; Fish et al. 2020, <https://doi.org/10.1016/j.jclinepi.2020.09.028>). [ADR 0013](adr/0013-participant-task-home-and-compact-views.md). | |
| DE16 | In round 1, a participant proposes an element that is missing from the list. | Should | *(proposed)* Round 1 ends with an open question for missing elements. The facilitator sees the proposals and adds an element to the next round by a rule set before round 1 opens, for example "proposed by at least two participants" (COMET Handbook section 2.7.6). | |
| DE17 | While rating, a participant flags a detail of an element as wrong, with a reason. | Should | *(proposed)* Next to the folded details a participant marks the data type, the cardinality or the values as wrong and writes why. The facilitator sees the flags per element, without the participant's name unless the round lets the facilitator see raters (DE4), and other participants never see them. The flags go to the detail step (DT1). Owner decision 2026-11-20 ([ADR 0014](adr/0014-rate-inclusion-detail-later.md)). | R-03 |
| DE18 | The rating screen shows one element per card. | Should | *(proposed)* A card shows the element's name and description, the participant's own previous score and the compact distribution (DE15), the scale, an optional reason and the folded details marked as not rated. "Previous" and "Next" move between the cards, the card says how far the participant is ("3 of 8"), and after the last card an overview lists every element with its rating, so the participant can check and change them. Each choice saves at once. At 1280 by 800 pixels a card fits without scrolling. Owner decision 2026-11-20. | |
| DE19 | A round shows the elements under their group headings, with the groups in a different order for each participant. | Should | *(proposed)* The rating card and the overview of a round show each element's group (EL18). The order of the groups is random per participant and stays the same for that participant during the round (Brookes et al. 2018, <https://doi.org/10.1186/s13063-017-2405-6>). The results of a closed round show the same headings in the facilitator's order of the groups (owner decision 2026-11-23); rating is over, so that order steers no score. Owner decision 2026-11-20 ([ADR 0020](adr/0020-discover-first-look-board-and-grouping.md)). | |

Design choices made while building the rounds, for the owner to confirm: one
round runs at a time; the facilitator closes a round only after its closing
date; the change class and the panel minimum are fixed once the first round
opens; a reason sent with a complete panel is not stored. On the rating
screen a score saves the moment it is chosen and a reason when the field
loses focus; dates show in the browser's time zone, with the zone named.

### Details

After the last rating round, the details of every element in the model are
settled in a step of their own ([ADR 0014](adr/0014-rate-inclusion-detail-later.md)).

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| DT1 | Modellers propose the structure of each element in the model: data type, cardinality and value list. | Should | *(proposed)* A participant of a stakeholder group with expert type architecture, or the facilitator, proposes the data type (in neutral words, from the data type list), the cardinality (the widest any use case in scope needs) and, for a coded or ordinal type, the value list with its meanings, ordinal numbers and units, starting from the element's linked source models (EL4), with their differences flagged, and the flags of DE17. Elements not in the model get no proposal. Owner decision 2026-11-20 ([ADR 0017](adr/0017-detail-structure-then-terminology.md)). An element is in the model when the newest closed round that rated it included it. The facilitator may propose before the detail phase opens (PR10); a participant proposes in the detail phase only. Settling a proposal copies its data type, cardinality and values onto the element, so the board and the exports read one place; the proposal keeps the history (owner decision 2026-11-23). | |
| DT2 | Participants answer each detail proposal by consent. | Should | *(proposed)* Each participant answers a proposal with "agree" or "objection with a reason". The facilitator sees the open objections and marks each one addressed with a note; a proposal is settled when no objection is open, and the board then shows the settled details. The method follows Sociocracy 3.0 consent decision making (<https://patterns.sociocracy30.org/consent-decision-making.html>), as SC3 does for the scope. A revised proposal is a new version: every answer resets and everyone answers again, and the objections to earlier versions stay readable with their notes (owner decision 2026-11-23). The facilitator settles a version once no objection to it is open; the facilitator and the members of an architecture group read the answers as counts and objections without names, other participants only their own answer (our own design). | |
| DT3 | A facilitator puts a contested value list to a rating round of its own. | Should | *(proposed)* Each value of the list becomes an item, rated under the round's rule like an element (DE1); the outcome settles which values the list keeps. Raised to Should on 2026-11-20 ([ADR 0017](adr/0017-detail-structure-then-terminology.md)). | |
| DT4 | Terminologists propose the codes of each element whose structure is settled. | Should | *(proposed)* Once an element's structure proposal is settled (DT2), a participant of a stakeholder group with expert type terminology, or the facilitator, proposes its codes (DT5). A second terminologist reviews the proposal before the group answers by consent as in DT2; when the project has one terminologist, the facilitator records why the review is skipped. Open codes do not hold up the hand-off: the export marks them as open. Owner decision 2026-11-20 ([ADR 0017](adr/0017-detail-structure-then-terminology.md)). | |
| DT5 | An element in the model carries its codes and binding. | Should | *(proposed)* An element code (code system and code, for example LOINC 8480-6), a code per value of its value list, and a binding strength (required, extensible, preferred or example, as FHIR, zibs and ADL2 share: <https://hl7.org/fhir/R4/terminologies.html#binding>) with an optional value set URL. The exports carry them. Owner decision 2026-11-20 ([ADR 0017](adr/0017-detail-structure-then-terminology.md)). | |

### Minimum panel

The minimum panel follows the minimum number of experts the Nictiz zib
management agreements set for the analysis step of a change, per change class
([Beheerafspraken zib's V1.0](https://www.zibs.nl/images/7/7a/Beheerafspraken_zorginformatiebouwstenen_V1.0.pdf),
section "Analyseren/in analyse"). cdm-plenum applies those counts to the panel
of a rating round; that use is our own adaptation, and later versions of the
agreements (V1.2, V1.3) were not checked because their links no longer work.

| Change class | Clinical | Terminology | Architecture |
|---|---|---|---|
| A, no change | 1 | 0 | 1 |
| B, small change | 2 | 1 | 1 |
| C, large change | 2 | 1 | 2 |
| D, large change or new model | 2 | 1 | 2 |

A participant counts toward the expert type of their stakeholder group once
they have joined the project (accepted the invitation). The minimum is a
guideline: a round below it opens with a reason (DE12), so a small teaching
group can still run a round. The Nictiz agreements also give a larger
"guideline" panel (for example 3 clinical experts for classes B to D); the
tool shows the minimum only.

### Open consultation

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| CO1 | After the rating rounds, a facilitator runs an open consultation on the agreed element list. | Could | *(proposed)* Respondents answer per element "agree", "agree with a small change" (with the change) or "disagree" (with a reason), after the open consultation of the Nictiz zib management agreements. The consultation is announced at least 15 working days ahead and lasts 10, 20 or 30 working days for change class B, C or D. The facilitator sees the answers per element and decides whether substantial comments send the project back to an earlier phase. Owner decision 2026-11-19: later, not in the first version. | |

### Hand-off and export

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| EX1 | Export the elements and their round outcomes as CSV. | Must | *(proposed)* One row per element with name, description, openEHR data type, FHIR data type, cardinality, source, linked CKM element, the CKM links of merged duplicates and the outcome of each round; the file opens correctly in a spreadsheet program. | |
| EX2 | Export the included elements as a FreeMind mind map (`.mm`), the format CKM itself serves for archetypes. | Must | *(proposed)* The file opens in Freeplane and in XMind and shows the concept as the root and each included element as a node with its description. | |
| EX3 | Export a decision report of the project. | Should | *(proposed)* The report holds the scope statement, the panel per stakeholder group, the consensus rule of each round, the response rate per round, and the outcome per element. Its structure follows the ACCORD reporting guideline (<https://doi.org/10.1371/journal.pmed.1004326>). | |
| EX4 | Export the anonymised ratings for analysis. | Should | *(proposed)* One row per rating with a random participant code per project, the stakeholder group, round, element and score; the code is stable within the project and does not appear in any other export. | R-03 |
| EX5 | Export the included elements as an ADL archetype skeleton. | Could | *(proposed)* The skeleton passes the openEHR archetype parser of the ADL Workbench without errors. | |
| EX6 | Export the included elements as a FHIR R4 logical model. | Could | *(proposed)* The StructureDefinition (kind `logical`) passes the HL7 FHIR validator; each element carries its FHIR data type (ADR 0009) and cardinality, and a FHIR link (EL10) as a mapping. | |

### Administration

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| AD1 | An administrator creates and deactivates accounts. | Must | *(proposed)* A deactivated account can no longer sign in; its ratings stay in closed rounds. | |
| AD2 | An activity log records sign-ins, round openings and closings, and exports. | Should | *(proposed)* Each entry has time, actor and action, and no rating value. | |

### Won't

| ID | Requirement | Priority | Reason |
|---|---|---|---|
| W1 | Author or edit ADL archetypes in the tool. | Won't | Archetype Designer and the ADL Workbench do this; cdm-plenum hands off to them. |
| W2 | Run formal CKM review rounds or publish to CKM. | Won't | CKM owns review and publication. |
| W3 | Store patient data. | Won't | The tool holds model elements and opinions about them, never patient records. |
| W4 | Templates (OET/OPT). | Won't | A template combines published archetypes; that work starts after the hand-off. |
| W5 | zib and FHIR export in the first version. | Won't | openEHR first; the element model stays neutral so these can follow. A FHIR logical model export is now EX6 (Could); a zib export stays out. |
| W6 | A participant card sort of the elements. | Won't | No study shows that a participant sort before a Delphi reduces items, duplicates or attrition; the order of grouped blocks biases ratings (Brookes et al. 2018), and an open sort needs about 15 sorters (Katsanos et al. 2019, <https://doi.org/10.1145/3290607.3312999>). The facilitator groups and participants check (EL18, EL24). Owner decision 2026-11-20. |

## Quality requirements

Classified by the ISO/IEC 25010 quality characteristics.

| ID | Characteristic | Requirement | Acceptance criterion |
|---|---|---|---|
| Q-ANON-1 | Security | Anonymity of authors and ratings is enforced on the server. | Tests per role show that no response to a participant names another participant as the author of an element, comment or rating, and that no response to the facilitator links a rating to a participant unless the round's setting allows it (DE4). |
| Q-SEC-1 | Security | Every page and server function checks the session and the project role. | Tests with one account per role find no project data reachable outside the role. |
| Q-SEC-2 | Security | HTTPS for all traffic. | All traffic is served over HTTPS behind the reverse proxy. |
| Q-PRIV-1 | Privacy | Store only what the method needs: name, e-mail address, stakeholder group and project contributions. | The database schema holds no other personal data; the data protection check with the institution's privacy officer is approved before the first study. |
| Q-PRIV-2 | Privacy | Logs never carry a rating, an element text or a person's name. | A test over the log output of a full round finds none of these. |
| Q-PRIV-3 | Privacy | Group results never show a group smaller than 3. | In the ratings export (EX4) a group is named only when at least 3 of its participants have ratings in the export. A stakeholder group with fewer than 3 ratings on an element is shown only in the overall result. |
| Q-AUDIT-1 | Traceability | Every element links to its source and to its rating history. | For any included element the export shows where it came from and its outcome in each round. |
| Q-ACC-1 | Accessibility | WCAG 2.1 level AA. | An axe check and a keyboard-only walkthrough find no errors at level A and AA. |
| Q-ACC-2 | Accessibility | Outcomes do not rely on colour alone. | Every outcome (included, excluded, no consensus) has text next to its colour. |
| Q-I18N-1 | Usability | The interface is available in English and Dutch. | Every user-visible text comes from the message catalogue; switching to Dutch leaves no English text on the Must screens. |
| Q-USE-1 | Usability | Compact views: one row per element, details on demand. | At 1280 by 800 pixels, the board shows at least 10 elements and a round's results at least 8 elements without scrolling past the page header ([ADR 0013](adr/0013-participant-task-home-and-compact-views.md)). |
| Q-PERF-1 | Performance | Fast pages. | Pages load within 2 seconds with a project of 100 elements and 50 participants. |
| Q-MAINT-1 | Maintainability | Transferable to a new developer. | Test coverage of the core is at least 70%; `CLAUDE.md` and the architecture documentation are up to date. |
| Q-MAINT-2 | Maintainability | Runs as containers through Compose. | The whole stack starts from the Compose file on a clean machine with Podman. |

## Risks

### Product risks

| ID | Risk | Likelihood | Impact | Measure |
|---|---|---|---|---|
| R-01 | A person sees a project they are not invited to. | Low | High | PR1, PR3, Q-SEC-1. |
| R-02 | The scope stays vague, so the element list keeps growing. | Medium | Medium | SC1, SC3. |
| R-03 | A participant's opinion becomes traceable to them, so senior voices dominate or people hold back. | Medium | High | EL2, DE4, DE5, Q-ANON-1, Q-PRIV-3. |
| R-04 | Participants drop out between rounds, so the result overstates consensus. | High | Medium | DE6, PR5; short rounds; the decision report shows the response rate. |
| R-05 | An imported file holds personal data by mistake. | Low | Medium | EL3 imports only name, description and source; the facilitator sees the rows before import. |
| R-06 | CKM is unreachable or changes its API. | Medium | Low | One CKM client; the board works without CKM; a link stores the archetype ID and revision. |
| R-07 | The consensus rule is changed after the results are known. | Low | High | DE1, DE2. |
| R-08 | A round runs with one expert type missing, so the outcome reflects only part of the expertise. | Medium | Medium | DE11 shows the shortfall; DE12 records the reason; the decision report shows the panel per expert type. |
| R-09 | The FHIR package registry is unreachable, or a package is large or changes between versions. | Medium | Low | One FHIR package client like the CKM client; a link stores package, version, canonical URL and path; the board works without the registry. |

### Project risks

| ID | Risk | Likelihood | Impact | Measure |
|---|---|---|---|---|
| P-01 | Too few clinicians available for a test round. | Medium | High | Plan the first study early with a course group; allow small panels. |
| P-02 | A research study needs ethical or privacy approval that takes time. | Medium | Medium | Start the privacy check (Q-PRIV-1) before the first study. |
| P-03 | Single maintainer. | Medium | Medium | Guard the scope with MoSCoW; drop Could items when time runs short. |

## Evaluation measures

The first use is research and teaching, so the tool records what an evaluation
needs. These are proposals.

| ID | Measure | Calculation |
|---|---|---|
| E-01 | Response rate per round | Completed participants divided by invited participants, per round and per stakeholder group. |
| E-02 | Consensus reached | Share of elements included or excluded after each round. |
| E-03 | Rounds to consensus | Number of rounds until no element has "no consensus", or until the facilitator stops. |
| E-04 | Reuse share | Share of included elements linked to an existing CKM archetype element. |
| E-05 | Element sources | Included elements per source (brainstorm, CSV import, CKM import). |

## External sources

The CKM REST API at `https://ckm.openehr.org/ckm/rest` answers without
sign-in. These calls were checked on 2026-11-19 and are the ones the openEHR
Assistant MCP server uses (`src/Tools/CkmService.php` in
<https://github.com/Cadasto/openehr-assistant-mcp>):

| Need | Call |
|---|---|
| Search archetypes (EL4) | `GET v1/archetypes?search-text=…&restrict-search-to-main-data=true&sort-key=RELEVANCE&size=…` with `Accept: application/json`; each row has the archetype ID, the CKM citeable identifier (`cid`), the status and the revision. |
| Current revision of an archetype (EL4, EL7) | `GET v1/archetypes/{cid}` with `Accept: application/json`: the row with `revision` and `buildUid`. The XML carries no revision; its `description/other_details[@id="build_uid"]` matches `buildUid`. |
| Element list of an archetype (EL4, EL7) | `GET v1/archetypes/{cid}/xml` (the archetype as XML) or `GET v1/archetypes/{cid}/adl`. |
| Mind map of an archetype | `GET v1/archetypes/{cid}/mindmap` returns FreeMind 1.0.1 XML. |
| Look up a `cid` from an archetype ID | `GET v1/archetypes/citeable-identifier/{archetype-id}`. |

If the API is unreachable or changes (R-06), the fallback is the openEHR CKM
mirror on GitHub (<https://github.com/openEHR/CKM-mirror>), which openEHR
keeps in sync with the international CKM.

The FHIR package registry at `https://packages.fhir.org` (EL10, EL11) answers
without sign-in. The package format is the FHIR NPM package specification
(<https://hl7.org/fhir/packages.html>). `src/server/fhir/` makes these calls,
checked on 2026-11-20 by its contract test (`pnpm test:fhir`):

| Need | Call |
|---|---|
| Search packages (EL10) | `GET catalog?name=…&fhirversion=R4` returns a JSON array with `Name`, `Description` and `FhirVersion`; a search for `nictiz` lists the Nictiz packages. |
| Versions of a package (EL10) | `GET {package}` returns `versions`, an object with one entry per version and its `fhirVersion`. The versions are not in order; the client sorts them by semantic version. |
| Contents of a version (EL10, EL11, EL12) | `GET {package}/{version}` returns the version as a gzipped tarball (`application/tar+gzip`). `package/package.json` names the package, version and `fhirVersions`; `package/.index.json` lists each file with its `resourceType`, `url`, `kind` and `type`. Each StructureDefinition is a JSON file in `package/` with its snapshot. The client refuses a tarball over 32 MiB, or one that unpacks to more than 160 MiB; `hl7.fhir.r4.core` 4.0.1 is about 13 MB packed and 49 MB unpacked. |

The zib FHIR profiles of `nictiz.fhir.nl.r4.zib2020` are profiles
(`kind = resource`), not logical models. Each names its zib in a
StructureDefinition mapping whose `uri` is the zib's page on zibs.nl, and maps
elements to their zib concept with a mapping whose `map` is the NL-CM id. They
state a component's LOINC or SNOMED CT code as a `patternCodeableConcept` on
its `code` element, not in `ElementDefinition.code`.

## Open questions

| ID | Question |
|---|---|
| O-1 | Resolved 2026-11-19: the CKM REST API, see [External sources](#external-sources). |
| O-2 | Resolved 2026-11-19: FreeMind `.mm`, as CKM serves it (EX2). |
| O-3 | Resolved 2026-11-19 by the owner: accounts come from an invitation system (PR1, PR3). How the invitation reaches the invitee (e-mail sent by the app, or a link the facilitator passes on) and how the invitee signs in afterwards is an architecture decision. |
| O-4 | Resolved 2026-11-19 by the owner: facilitators can rate, as a member of one stakeholder group (DE14). |
| O-5 | Resolved 2026-11-19 by the owner: a duplicate's CKM link stays recorded and is shown and exported as provenance of the merged element (EL5, EX1). |
