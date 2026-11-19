<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Architecture

cdm-plenum guides a group from the scope of a clinical concept to an agreed
list of data elements, before anyone authors an archetype. It is one web
application on one PostgreSQL database. It reads archetypes from the openEHR
Clinical Knowledge Manager (CKM) and writes exports that the existing
authoring tools and CKM review take over.

This document is the design authority. Where it and a later
[decision record](adr/README.md) disagree, the decision record wins.
Requirement IDs refer to [requirements.md](requirements.md), which is a
working draft.

## Drivers

- **Trustworthy consensus.** A rating outcome only counts when the rule was
  fixed before the round and nobody could be pressured by who said what
  (DE1, DE2, DE4, R-03, R-07).
- **Reuse before new modelling.** Every candidate element can be checked
  against existing CKM archetypes while the group is still brainstorming
  (EL4, EL7).
- **Research use.** The first users are research and teaching groups, so the
  tool records what a study report needs (EX3, EX4, the evaluation measures).
- **Long-term continuity.** A new maintainer or an AI session can pick up the
  project from the repository alone.

## Principles

| Principle | Consequence for the design |
|---|---|
| Anonymity on the server | Authors of elements and comments, and the link between a rating and a participant, never leave the server unless a round setting allows it ([ADR 0005](adr/0005-rating-pseudonyms-and-anonymity.md)). |
| Rules before results | A round's scale, thresholds and closing date are fixed when it opens; the server refuses a change. |
| Front end, not a replacement | No ADL authoring, no CKM review, no templates ([ADR 0003](adr/0003-front-end-before-ckm.md)). |
| Record where things come from | Every element keeps its source (brainstorm, CSV file, CKM archetype) and its outcome in each round (Q-AUDIT-1). |
| Data minimisation | Only name, e-mail address, stakeholder group and project contributions are stored; no patient data (Q-PRIV-1, W3). |
| Open standards | openEHR archetypes from CKM in; FreeMind `.mm`, CSV and later ADL out. |

## The process the tool follows

A project moves through four phases (PR4). The facilitator moves it on; the
earlier phases stay readable.

| Phase | What happens | Requirements | Method and source |
|---|---|---|---|
| Scope | The facilitator writes the scope statement; participants comment; optionally the group consents to it. | SC1 to SC3 | Consent decision making, Sociocracy 3.0 |
| Discover | Participants add candidate elements anonymously; the facilitator imports CSV files and CKM archetypes, links elements to CKM, merges duplicates. | EL1 to EL8 | Brainwriting (Diehl and Stroebe 1987, <https://doi.org/10.1037/0022-3514.53.3.497>); card sorting |
| Decide | One or more e-Delphi rounds rate the elements on a fixed scale against a fixed rule; results per stakeholder group feed the next round. | DE1 to DE10 | e-Delphi; consensus definition from the COMET Handbook (<https://doi.org/10.1186/s13063-017-1978-4>) |
| Hand-off | Exports for the modellers and for the study report. | EX1 to EX5 | ACCORD reporting guideline (<https://doi.org/10.1371/journal.pmed.1004326>) |

The first version (the Must rows) covers scope, the board with CSV import and
CKM linking, rating rounds and the CSV and mind map exports. The live workshop
mode, the card sort and objection handling come after it.

## Roles and access

Roles are held per project ([ADR 0004](adr/0004-projects-as-organizations-with-invitations.md)).
Two roles are application-wide: administrator, and the facilitator right to
create projects (owner decision 2026-11-19). The right is held apart from the
project role of the same name: creating a project needs the right, and makes
the creator the project's facilitator. Revoking the right stops new projects
and leaves existing projects and memberships alone.

| Role | Held | May | Sees |
|---|---|---|---|
| Facilitator (right) | application | create a project | nothing by itself |
| Facilitator | per project | everything in the project: scope, board, stakeholder groups, invitations, rounds, exports | all project content; who added an element; who took part in a round; who gave which rating only when the round allows it (DE4) |
| Participant | per project | read the scope, add and comment on elements, rate in an open round | project content without authors; their own ratings; group results of closed rounds |
| Administrator | application | manage accounts, the administrator role and the facilitator right; read the activity log | no project content unless they also hold a project role |

An administrator grants and revokes the application roles by e-mail address
with `pnpm admin:grant <email> [--facilitator]` and `pnpm admin:revoke`, so the
first administrator and the first facilitator can get an account (AD1). The
grants are in `app_role`.

Every server function checks the session, then the project role, then
ownership inside the SQL query. A user without a role in a project gets
`not_found`, never a hint that the project exists; a participant asking for a
facilitator action gets `forbidden`. Route guards only steer navigation; they
are not the security boundary (Q-SEC-1).

A new project starts with nine stakeholder groups, each with an expert type
(PR6): the clinical groups general medicine, primary care, mental health
care, nursing, medication and allergies, patient and administrative, one
terminology group and one architecture group, after the expert areas of the
Nictiz zib management agreements. Their names are in the creator's language;
the facilitator adds, renames and removes groups. A group with members or a
pending invitation cannot be removed.

### Joining a project

There is no open registration (PR1). The flow:

1. The facilitator invites an e-mail address into one stakeholder group.
2. The app sends an invitation e-mail with a link that expires
   (`/invite/<id>`). When no SMTP server is configured, the facilitator copies
   the link from the invitation list and passes it on.
3. The invitee opens the link and asks for a sign-in link. The invitation
   page shows the project name only while the invitation is pending. A user
   account is created only for an e-mail address with a pending, unexpired
   invitation or an administrator grant; an address without either gets no
   e-mail, and the sign-in page answers the same either way.
4. Signing in through the e-mailed link accepts every pending invitation for
   that address in one transaction: the user becomes a participant of the
   project, a member of the stakeholder group, and gets a rating code.

Sign-in is by single-use e-mail link only, so the app stores no passwords.
The link is stored hashed and expires after 5 minutes; an invitation expires
after 48 hours. Both are the plugin defaults, as no requirement sets them.
Without `SMTP_URL` the app sends no e-mail: the facilitator copies the
invitation link, and a sign-in link is written to the server log in
development only.
Institution sign-in through OpenID Connect can be added later as a second
method without changing the project model.

## Data

One PostgreSQL database. better-auth owns its tables (users, sessions,
organizations, members, teams, invitations); cdm-plenum adds its own. All
access goes through Kysely ([ADR 0002](adr/0002-stack-follows-edulims.md)).

| Concept | Stored as | Notes |
|---|---|---|
| Project | better-auth `organization` plus `project` (phase, change class A to D, default D) | one project is one organization |
| Stakeholder group | better-auth `team` with `expert_type` | a participant is in exactly one group of the project; expert type `clinical`, `terminology` or `architecture` (PR6) |
| Minimum panel override | `project_panel_minimum` | per project and expert type, only when the facilitator changes a class default (DE13) |
| Facilitator, participant | better-auth `member` with a custom role | one membership per person per project |
| Administrator, facilitator right | `app_role` | e-mail address and role, so a grant can exist before the account |
| Invitation | better-auth `invitation` with its team | |
| Scope statement | `scope_statement`, `scope_source`, `scope_comment` | one statement per project; SC3 objections later |
| Candidate element | `element` | name, description, data type (a key from the data type list, or none), cardinality as `min_occurs` and `max_occurs` (null for many), `merged_into` for merged duplicates, `author_member_id` (never sent to participants) |
| Proposed value | `element_value` | ordered values of a coded, ordinal or scale element: text and optional number (EL9) |
| Element source | `element_source` | kind (`brainstorm`, `csv`, `ckm`), label (file name or archetype ID) |
| CKM link | `element_ckm_link` | archetype ID, CKM `cid`, revision at linking time, at-code, element name as CKM showed it |
| Comment | `element_comment` | author hidden as for elements (EL6) |
| Round | `round` | number, scale minimum and maximum, the rule's percentages and score bands, opens and closes at, `facilitator_sees_raters`; when it opens: `panel_*` and `minimum_*` per expert type and `below_minimum_reason` (DE12), held by one CHECK: a draft has no snapshot, an open round all of it, a reason exactly when below the minimum |
| Elements in a round | `round_element` | which elements are rated; the outcome is written when the round closes |
| Rating pseudonym | `rating_code` | one random code per participant per project ([ADR 0005](adr/0005-rating-pseudonyms-and-anonymity.md)) |
| Rating | `rating` | round, element, rating code, score or "unable to rate", optional reason, and `team_id`: the rater's stakeholder group when the rating was saved, so group results never read the code-to-member table (ADR 0005) |
| Activity log | `activity_log` | time, actor, action, target id; never a score, an element text or a name (Q-PRIV-2) |

The database holds the rules it can check itself, so no code path can skip
them (`src/server/db/migrations/0002_projects.ts`):

- `CHECK` constraints on the data type key, the cardinality, the phase, the
  outcome and the round's scale and percentages.
- A trigger refuses a change to a round's rule, closing date, rater setting or
  panel snapshot once the round is open (DE2, DE12).
- A trigger accepts a rating only while its round is open, with a score inside
  the round's scale and a rating code of the round's project (DE3).
- Rating codes are random version 4 UUIDs; other ids are `uuidv7()`.

### Element data types

An element's data type is one key from a fixed list in `src/lib/data-types.ts`.
Each key names the openEHR Reference Model data value type, which the
archetype skeleton (EX5) uses, and the nearest FHIR data type, so the same
element list can later feed a FHIR logical model or a zib
([ADR 0009](adr/0009-element-data-types.md)). The openEHR types come from the
RM data types specification
(<https://specifications.openehr.org/releases/RM/development/data_types.html>),
the FHIR types from the FHIR R5 data types page
(<https://hl7.org/fhir/R5/datatypes.html>). No specification maps one to the
other; the pairing below is our own design.

| Key | openEHR RM type | FHIR type | Use for |
|---|---|---|---|
| `text` | `DV_TEXT` | `string` | free text |
| `coded_text` | `DV_CODED_TEXT` | `CodeableConcept` | a value from a value set or terminology |
| `quantity` | `DV_QUANTITY` | `Quantity` | a magnitude with a UCUM unit |
| `count` | `DV_COUNT` | `integer` | a count without a unit |
| `ordinal` | `DV_ORDINAL` | `CodeableConcept` | an integer score with a symbol, such as Apgar; FHIR has no core type that carries the score |
| `scale` | `DV_SCALE` | `CodeableConcept` | a score that allows decimals, such as Borg CR10; same note as `ordinal` |
| `proportion` | `DV_PROPORTION` | `Ratio` | a ratio, titre or percentage |
| `boolean` | `DV_BOOLEAN` | `boolean` | a true yes or no; not for enumerations |
| `date` | `DV_DATE` | `date` | a calendar date, also partial |
| `date_time` | `DV_DATE_TIME` | `dateTime` | a point in time |
| `time` | `DV_TIME` | `time` | a time of day |
| `duration` | `DV_DURATION` | `Duration` | a length of time |
| `quantity_interval` | `DV_INTERVAL<DV_QUANTITY>` | `Range` | a range of quantities |
| `date_time_interval` | `DV_INTERVAL<DV_DATE_TIME>` | `Period` | a period between two points in time |
| `identifier` | `DV_IDENTIFIER` | `Identifier` | an identifier issued by an authority |
| `multimedia` | `DV_MULTIMEDIA` | `Attachment` | an image, a document or a signal |
| `uri` | `DV_URI` | `uri` | a link to a resource |

The list shows the type descriptions from the specification, including its
misuse notes (for example that `DV_BOOLEAN` is not for male or female), so
participants without modelling background pick a fitting type. An element
linked to CKM (EL4) takes its type from the archetype; a CKM type outside the
list is kept as its RM name and exported without a FHIR type.

Cardinality is stored as a minimum and a maximum. openEHR occurrences and
FHIR element cardinality both use this form (`0..1`, `1..*`), so the
exports write it unchanged.

### Minimum panel

The class defaults live in one table in `src/lib/panel.ts` (the counts in
[requirements.md](requirements.md#minimum-panel)); a project row in
`project_panel_minimum` overrides one expert type. When a round opens, the
server counts the joined participants per expert type in the same
transaction, compares them with the minimum, and stores both on the round as
they were at that moment, so a later change to the panel or the class does
not rewrite what the report says about an earlier round. A shortfall needs a
reason and never blocks the round
([ADR 0010](adr/0010-minimum-panel-as-guideline.md)).

### Consensus calculation

The outcome of an element is calculated by one pure function in
`src/lib/consensus.ts`, used by the round page and every export, so the
screen and the files cannot disagree. Its inputs are the scores and the
round's rule; "unable to rate" counts toward the response rate but not
toward the percentages. That exclusion is our own design: no source
consulted settles it, and the decision report states it.

The default rule is the one in DE1. Every threshold is stored on the round,
so a project can use another rule and the report shows which one applied.

Group results are calculated per stakeholder group, taken from
`rating.team_id`, and shown only for a group with at least 3 ratings on the
element (Q-PRIV-3); smaller groups count in the overall result only.

### Round life cycle

A round is a draft until the facilitator opens it; only a draft can change.
One round runs at a time: a new round needs the previous one closed. The
facilitator closes a round once its closing date has passed, never earlier,
because an early close would shorten a date DE2 fixes; between the date and
the close the round shows as awaiting close and the database already refuses
ratings. Closing writes each element's outcome in one transaction. Only
participants rate (O-4 is open). Reads never change a round.

## Application structure

| Concern | Choice | Record |
|---|---|---|
| Web framework | TanStack Start with full server-side rendering | [ADR 0002](adr/0002-stack-follows-edulims.md) |
| Language and tooling | TypeScript in strict mode, Biome | ADR 0002 |
| Sign-in, projects, invitations | better-auth with the organization and magic link plugins | [ADR 0004](adr/0004-projects-as-organizations-with-invitations.md) |
| Data access | Kysely on PostgreSQL | ADR 0002 |
| UI | React, Tailwind, shadcn/ui; WCAG 2.1 AA | ADR 0002 |
| Code language and UI text | English code; UI text through Paraglide, English source and Dutch translation | [ADR 0007](adr/0007-english-code-and-i18n.md) |
| CKM access | one typed client on the server | [ADR 0006](adr/0006-one-ckm-client.md) |

Versions are pinned in `package.json`, not in these documents.

The code follows the layout of eduLIMS
(<https://github.com/Vernum-Projecten/eduLIMS>):

- `src/routes/`: file routes. A pathless `_authed` layout requires a
  session; `projects/$projectId` loads the user's project role once.
- `src/server/<area>/`: `functions.ts` (server functions: session and role
  middleware, then Zod validation), `queries.ts` (Kysely, with the role and
  ownership check in the SQL) and `schemas.ts` (Zod). Areas: `projects`,
  `invitations`, `scope`, `elements`, `rounds`, `exports`, `ckm`, `admin`.
- `src/lib/`: code both sides import, among them `consensus.ts` and the
  export writers (`csv.ts`, `freemind.ts`).
- `src/components/<area>/`: feature components on shadcn/ui primitives in
  `src/components/ui/`.
- `messages/`: `en.json` (source) and `nl.json`.

### CKM client

`src/server/ckm/` is the only module that calls CKM, through the calls listed
in [requirements.md](requirements.md#external-sources); a unit test fails
when another module names the CKM base URL. Every call has a timeout, reads a
capped body and returns a typed result (unreachable, timeout, refused,
unusable answer). Search results and archetype element lists are cached for
a day, keyed by `cid` and revision. When CKM is unreachable the board keeps
working: linking and importing show the error, nothing else waits on CKM
(R-06).

The element list of an archetype is read from the XML form
(`v1/archetypes/{cid}/xml`): every `ELEMENT` node with its path, at-code,
term text in the archetype's original language, occurrences and data type.
Internal references and slots are skipped. The current revision comes from the
archetype's JSON row, because the XML has none; the XML is refused when its
archetype ID or build id differs from that row. The parser refuses any
`DOCTYPE` or entity declaration and decodes only the five predefined
entities, so a hostile document cannot expand entities.

Limits: 10 seconds per call, 4 MiB per body, 200 cached entries per kind for
one day. A redirect is refused, not followed. `CKM_BASE_URL` points the client
at another CKM; the international CKM is the default.

A link stores the archetype ID, revision and at-code, so a later CKM change
does not silently change what the group rated. Linking is refused when CKM
now has another revision than the facilitator saw. The link's `rm_type` holds
the type as CKM writes it, several types of a choice joined with ` | `, or
`DATA_VALUE` for an open value; the element's data type key is set only when
there is exactly one type and it is in the list. Importing the same archetype
twice into a project is refused.

`pnpm test:ckm` runs a contract test against the live CKM; a scheduled
workflow (`.github/workflows/ckm-contract.yml`) runs it every week, so an API
change shows up without blocking pull requests (ADR 0006).

### Exports

All exports are generated on request from the database and are not stored.

| Export | Format | Requirement |
|---|---|---|
| Elements with outcomes | CSV, UTF-8 with header row; openEHR and FHIR type per element | EX1 |
| Mind map of included elements | FreeMind `.mm`, version 1.0.1 as CKM writes it | EX2 |
| Decision report | HTML, printable to PDF, sections following ACCORD | EX3 |
| Anonymised ratings | CSV, one row per rating with the rating code | EX4 |
| Archetype skeleton | ADL 1.4 | EX5 (Could) |

## Deployment

Everything runs as containers with Compose on one host
([ADR 0008](adr/0008-compose-with-podman.md)).

| Container | Role |
|---|---|
| cdm-plenum | web app and server functions |
| PostgreSQL | the database |
| Mailpit (development only) | catches invitation and sign-in e-mails locally |

In production a reverse proxy in front of the app terminates TLS (Q-SEC-2),
and the app sends e-mail through the institution's SMTP server.

## Quality requirements

The full list is in [requirements.md](requirements.md#quality-requirements).
The ones that shape the architecture:

| ID | Where the architecture answers it |
|---|---|
| Q-ANON-1 | rating codes ([ADR 0005](adr/0005-rating-pseudonyms-and-anonymity.md)); author columns never selected in participant queries; negative tests per role |
| Q-SEC-1 | session, project role and ownership checks in every server function and query |
| Q-PRIV-1, Q-PRIV-2 | the data table above is the complete list of personal data; log rows carry ids only |
| Q-PRIV-3 | group results only from 3 ratings, in `consensus.ts` |
| Q-AUDIT-1 | `element_source`, `element_ckm_link` and `round_element` outcomes |
| Q-ACC-1, Q-ACC-2 | shadcn/ui on Radix primitives; axe in Playwright tests; outcome text next to colour |
| Q-I18N-1 | Paraglide message catalogues; no hard-coded UI text |
| Q-MAINT-2 | one Compose file starts the stack with Podman |
