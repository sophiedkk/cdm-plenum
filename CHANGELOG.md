<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Changelog

All notable changes to cdm-plenum are recorded in this file. The format
follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and
the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- `pnpm db:seed-demo` loads a demo project on blood pressure into a
  development database: a scope, eight elements, eight invented participants,
  a closed first round with results and an open second round.
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

### Changed

- Up to 30 sign-in link requests, and 30 link openings, per minute per
  network address, up from 5, so a class behind one address can sign in
  together.

### Security

- A deactivated account can no longer sign in, and its open sessions end at
  once.

