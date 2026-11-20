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

### Scope

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| SC1 | A facilitator writes the scope statement: concept, use cases, out of scope, source documents. | Must | *(proposed)* The scope statement has the four parts; participants can read it but not edit it. | R-02 |
| SC2 | Participants comment on the scope statement. | Should | *(proposed)* A participant adds a comment; the facilitator sees all comments next to the statement. | |
| SC3 | The group accepts the scope by consent, with a review date. | Could | *(proposed)* Participants answer "consent" or "objection with reason"; the facilitator sees the open objections and marks each one addressed. The method follows Sociocracy 3.0 consent decision making (<https://patterns.sociocracy30.org/consent-decision-making.html>). | R-02 |

### Element board

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| EL1 | Participants add candidate elements to the project's board. | Must | *(proposed)* A participant adds an element with a name and a description; data type, cardinality and source are optional. The data type is picked from the data type list, which shows the openEHR type and the FHIR type side by side, or left as "not decided". Cardinality is a minimum (0 or 1) and a maximum (1, a number, or many). | |
| EL2 | Other participants do not see who added an element. | Must | *(proposed)* No page or API response shown to a participant contains the author of an element; the facilitator sees the author. | R-03 |
| EL3 | A facilitator imports candidate elements from a CSV file. | Must | *(proposed)* A CSV with a name and description column adds one element per row; a row without a name is reported and not imported; the file's name is stored as the source. The file is UTF-8 with a header row, comma or semicolon separated, at most 1 MiB and 1,000 rows; `data_type` takes the key or the RM type name and `cardinality` the form `0..1`. | R-05 |
| EL4 | A facilitator links a candidate element to an existing element of a CKM archetype. | Must | *(proposed)* The facilitator searches CKM from the element, picks an archetype and an element, and the element shows the archetype ID, its revision and the element's at-code. The search uses the CKM REST API (see [External sources](#external-sources)). | R-06 |
| EL5 | A facilitator merges duplicate elements and edits an element's wording. | Must | *(proposed)* Merging two elements keeps both descriptions and both sources on the result; comments of both stay readable. A merge is refused for an element that is already in a round, and when the proposed values do not fit the result's data type. A CKM link on a duplicate stays recorded and is shown and exported as provenance of the result; the result's own link does not change. Owner decision 2026-11-19. | |
| EL6 | Participants comment on an element. | Should | *(proposed)* A comment appears under the element; the author is hidden from other participants as in EL2. | R-03 |
| EL7 | A facilitator imports the elements of an existing CKM archetype as candidates. | Should | *(proposed)* Every element of the chosen archetype becomes a candidate linked to that archetype element (EL4). | R-06 |
| EL8 | Volunteers sort the elements in an open card sort, as an optional step before the facilitator groups them. | Should | *(proposed)* The facilitator switches the sort on after merging duplicates and picks the sorters. Each sorter makes and names their own groups, by meaning and not by importance, and sees at most 60 elements (a random subset of a longer list). A sort with one group only, or with more than a quarter of its elements unsorted, is flagged. The facilitator sees a heat map of how often two elements share a group, suggested clusters and the group names, marked as suggestions and as indicative below 10 sorts; a sorter sees the combined result only after submitting their own sort. Owner decision 2026-11-20, after validation ([ADR 0012](adr/0012-discover-phase-sources-private-brainstorm-sort.md)); raised from Could. | R-03 |
| EL9 | A facilitator lists proposed values for an element of a coded type (coded text, ordinal, scale). | Should | *(proposed)* The element holds an ordered list of values, each with a text and, for ordinal and scale, a number; the list appears in the exports. | |
| EL10 | A facilitator searches FHIR packages and links a candidate element to an element of a FHIR resource, profile or logical model. | Should | *(proposed)* The facilitator searches the FHIR package registry for FHIR R4 packages (for example `hl7.fhir.r4.core`, `hl7.fhir.uv.ips`, `nictiz.fhir.nl.r4.zib2020`), opens a StructureDefinition and links an element to one of its element paths (for example `Observation.component.value[x]`). The link stores the package, its version, the canonical URL and the path. An element can carry a CKM link and a FHIR link at the same time. Owner decision 2026-11-19. | R-09 |
| EL11 | A facilitator imports the elements of a FHIR profile or logical model as candidates. | Could | *(proposed)* Every element of the chosen StructureDefinition becomes a candidate linked to that element (EL10), with source kind `fhir`, as EL7 does for an archetype. | R-09 |
| EL12 | Participants add the sources they work with, and each element records the sources it appears in. | Should | *(proposed)* A participant adds a source (a form, local data set, guideline, registry dictionary, or a CKM, zib or FHIR model) with a title, a kind and an optional link or file. An element links to one or more sources; the board shows per element in how many sources it appears (Grinnon et al. 2012, <https://doi.org/10.1177/1740774512438980>; COMET Handbook section 2.7). | |
| EL13 | In the brainstorm, participants first add elements privately; the facilitator reveals the board. | Must | *(proposed)* A project setting, on by default: until the facilitator reveals the board, a participant sees only their own elements, and the facilitator sees all elements and the count per participant. After the reveal everyone sees every element, without authors (EL2). Owner decision 2026-11-20 (Diehl and Stroebe 1987, <https://doi.org/10.1037/0022-3514.53.3.497>; Kohn and Smith 2011, <https://doi.org/10.1002/acp.1699>). | R-03 |
| EL14 | The add screen guides participants with four questions in clinicians' words. | Should | *(proposed)* The questions ask what is recorded, what about the patient is needed to interpret it, how it was measured (method or device), and in which context it is used; clinical information models separate these parts (for example `data`, `state` and `protocol` in an openEHR OBSERVATION, <https://specifications.openehr.org/releases/RM/latest/ehr.html>), but the questions name no standard. An element stores the question it answered, which the facilitator can use to group it (EL18). No spec governs the wording; our own design. | |
| EL15 | A participant adds an element with a name and one line; the other fields are optional. | Should | *(proposed)* The add form shows a name and a short description; data type, cardinality, sources and values sit behind "More details". After the reveal (EL13), the form lists existing elements with a similar name while the participant types, with a link to mark "same as" (EL16) instead of adding. | |
| EL16 | After the reveal, participants mark an element "I support this" or "same as" another element. | Should | *(proposed)* Both marks are anonymous to other participants (EL2). The facilitator sees the number of supporters and the proposed duplicates, and decides on merges (EL5). A mark never includes or excludes an element; that is the Delphi's task. | R-03 |
| EL17 | Participants see example elements on request. | Could | *(proposed)* A button shows a few elements from the models in the sources (EL12), such as archetypes, profiles or zibs, or, after the reveal, from other participants; the examples never appear unasked (Siangliulue et al. 2015, <https://doi.org/10.1145/2757226.2757230>). | |
| EL18 | The facilitator groups the elements before the Delphi. | Should | *(proposed)* The facilitator creates named groups, either by the four questions of EL14 (recorded, patient state, method, context) or groups of their own, and assigns each element to one group, helped by the sort (EL8) and the questions (EL14). The groups appear in the rounds and the exports (COMET Handbook section 2.7.1.2). | |
| EL19 | The facilitator sees whether new sources still add elements. | Could | *(proposed)* A view shows, per source in the order added, how many elements it added that no earlier source had. No source gives a numeric stopping rule; the facilitator decides when the list is complete (COMET Handbook section 2.7.1.1). | |

### Delphi rounds

| ID | Requirement | Priority | Acceptance criterion | Risk |
|---|---|---|---|---|
| DE1 | A facilitator sets up a rating round on the candidate elements, with a scale, a consensus rule and a closing date. The facilitator can adjust the scale and every threshold of the rule. | Must | *(proposed)* The default is a 1 to 9 scale and the rule "included when at least 70% score 7 to 9 and at most 15% score 1 to 3; excluded when at least 70% score 1 to 3 and at most 15% score 7 to 9; otherwise no consensus" (Williamson et al., COMET Handbook, <https://doi.org/10.1186/s13063-017-1978-4>). The facilitator can change the scale length and each percentage and score band before the round opens. A round cannot open without a rule and a closing date. The rating question asks whether the element belongs in the data model, for any use case in scope: the common data model is a maximal data set, every element a use case in scope needs, whichever standard implements it later (the principle as openEHR states it: Leslie 2014, <https://openehr.atlassian.net/wiki/download/attachments/2949213/2014+07+openEHR+approach.pdf>), not a minimal core set; an excluded element is kept as "not in the model" with its reasons. The wording names no standard. Owner decision 2026-11-20. The rating covers inclusion only: whether the element, by its name and description, belongs in the model. Data type, cardinality and values show as context, marked as not rated, and are settled in the detail step (DT1 to DT3, [ADR 0014](adr/0014-rate-inclusion-detail-later.md)). Owner decision 2026-11-20. | R-07 |
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
| DT1 | Modellers and terminologists propose the details of each element in the model. | Should | *(proposed)* A participant of a stakeholder group with expert type architecture or terminology, or the facilitator, proposes the data type, the cardinality and, for a coded type, the value list of an element in the model, starting from the element's current details and the flags of DE17. Elements not in the model get no proposal. Owner decision 2026-11-20. | |
| DT2 | Participants answer each detail proposal by consent. | Should | *(proposed)* Each participant answers a proposal with "agree" or "objection with a reason". The facilitator sees the open objections and marks each one addressed with a note; a proposal is settled when no objection is open, and the board then shows the settled details. The method follows Sociocracy 3.0 consent decision making (<https://patterns.sociocracy30.org/consent-decision-making.html>), as SC3 does for the scope. | |
| DT3 | A facilitator puts a contested value list to a rating round of its own. | Could | *(proposed)* Each value of the list becomes an item, rated under the round's rule like an element (DE1); the outcome settles which values the list keeps. | |

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
without sign-in. These calls were checked on 2026-11-19; the package format
is the FHIR NPM package specification
(<https://hl7.org/fhir/packages.html>):

| Need | Call |
|---|---|
| Search packages | `GET catalog?name=…&fhirversion=R4` returns a JSON array with `Name`, `Description` and `FhirVersion`; a search for `nictiz` lists the Nictiz packages. |
| Versions of a package | `GET {package}` returns the package's versions, for example `nictiz.fhir.nl.r4.zib2020` up to `0.9.0-beta.1`. |
| Contents | Each version is an NPM tarball with the package's StructureDefinitions; which packages hold logical models (for example the zibs) is not yet checked. |

## Open questions

| ID | Question |
|---|---|
| O-1 | Resolved 2026-11-19: the CKM REST API, see [External sources](#external-sources). |
| O-2 | Resolved 2026-11-19: FreeMind `.mm`, as CKM serves it (EX2). |
| O-3 | Resolved 2026-11-19 by the owner: accounts come from an invitation system (PR1, PR3). How the invitation reaches the invitee (e-mail sent by the app, or a link the facilitator passes on) and how the invitee signs in afterwards is an architecture decision. |
| O-4 | Resolved 2026-11-19 by the owner: facilitators can rate, as a member of one stakeholder group (DE14). |
| O-5 | Resolved 2026-11-19 by the owner: a duplicate's CKM link stays recorded and is shown and exported as provenance of the merged element (EL5, EX1). |
