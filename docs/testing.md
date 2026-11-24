<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Testing

cdm-plenum has three automated suites and a manual walkthrough on demo data.
Every command runs in the development container, so you need Podman (or
Docker) with compose and nothing else on your machine.

| Suite | Tool | What it covers | Command |
| --- | --- | --- | --- |
| Unit and database | Vitest | `src/lib/` (consensus, panel, cardinality, data types), the server queries on real PostgreSQL, the role checks and the anonymity boundary | `scripts/dev/pnpm.sh test` |
| Components | Vitest with jsdom | React components with logic of their own, such as the CSV import and the CKM panel | part of `test` |
| End to end | Playwright with Chromium and axe | Every page, in English and Dutch, against the production build: sign-in through Mailpit, invitations, scope, board, rounds, members, admin and export, with an accessibility check on each page | `scripts/dev/e2e.sh` |
| CKM contract | Vitest | The calls the CKM client makes, against the live CKM | `scripts/dev/pnpm.sh test:ckm` |
| FHIR contract | Vitest | The calls the FHIR package client makes, against the live registry | `scripts/dev/pnpm.sh test:fhir` |

## Before you start

Install the dependencies and start PostgreSQL and Mailpit:

```sh
scripts/dev/pnpm.sh install
scripts/dev/compose.sh up -d postgres mailpit
```

The tests never touch your development data. Each Vitest run and each
Playwright run creates a database of its own next to the development
database, migrates it, and drops it when the run ends. Within a Vitest run,
every test runs inside a transaction that is rolled back.

## Run the checks

```sh
scripts/dev/pnpm.sh check            # typecheck, lint and unit tests: run before every commit
scripts/dev/pnpm.sh test:coverage    # unit tests with the coverage gate
scripts/dev/e2e.sh                   # build, then the browser tests
```

The first `e2e.sh` run also builds the e2e image, so it takes longer than
the runs after it.

To run part of a suite:

```sh
scripts/dev/pnpm.sh exec vitest run src/lib/consensus.test.ts
scripts/dev/pnpm.sh test:watch                 # rerun on every change
scripts/dev/e2e.sh tests/e2e/rounds.spec.ts
scripts/dev/e2e.sh --grep "sign-in"
```

`test:coverage` fails when line, statement, function or branch coverage of
`src/server/` and `src/lib/` drops below 70%. The report lands in
`coverage/`. The server functions (`functions.ts`) and query options have no
unit tests; the e2e suite covers them.

### Reading an e2e failure

A failed spec keeps a Playwright trace in `test-results/<spec folder>/trace.zip`.
The dev container has no screen, so open the file on your own machine at
<https://trace.playwright.dev>; the viewer runs in your browser and does not
upload the file. In CI, the HTML report of a run is an artifact named
`playwright-report`.

Lines such as `Idle database connection lost: terminating connection due to
administrator command` at the end of a run are expected: they appear when
the run database is dropped while the server still holds idle connections.

### Two e2e runs at once

podman-compose puts the containers of the stack in one network namespace, so
a second run on the default ports collides with the first. Give it other
ports:

```sh
E2E_PORT=3200 E2E_CKM_PORT=3201 scripts/dev/e2e.sh
```

### Settings

The defaults point at the services of `compose.dev.yaml`. CI overrides them.

| Variable | Default | Used by |
| --- | --- | --- |
| `TEST_DATABASE_URL` | `postgres://cdm_plenum:cdm_plenum@postgres:5432/cdm_plenum` | both suites; the role needs `CREATEDB` |
| `SMTP_URL` | `smtp://mailpit:1025` | e2e |
| `MAILPIT_URL` | `http://mailpit:8025` | e2e |
| `E2E_PORT` | `3100` | e2e, the app |
| `E2E_CKM_PORT` | `3101` | e2e, the CKM stub |

## The CKM contract test

The unit and e2e suites never call the live CKM: the unit tests use recorded
responses and the e2e suite runs a stub (`tests/e2e/ckm-stub.ts`). The
contract test checks that the live API still answers the way the client
expects. Vitest skips it unless you run it on purpose, so a normal run shows
4 skipped tests. Run it locally with `scripts/dev/pnpm.sh test:ckm`; the
`ckm-contract` workflow runs it every Monday.

## The FHIR contract test

The unit tests never call the live FHIR package registry: they build the
synthetic package in `src/server/fhir/fixtures/` into a tarball and serve it
from a local stub. The contract test reads the Nictiz zib2020 package and
zib BloodPressure from the live registry. Vitest skips it unless you run it on
purpose, so a normal run shows 4 more skipped tests. Run it locally with
`scripts/dev/pnpm.sh test:fhir`; the `fhir-contract` workflow runs it every
Monday.

## Continuous integration

`.github/workflows/ci.yml` runs typecheck, lint, `test:coverage`, the build
and the e2e suite on every pull request and on every push to `main`, on
PostgreSQL and Mailpit service containers. The `conclusion` job is the one
check to require.

## Write a test

- **Where:** put a unit test next to its file as `*.test.ts`. A component
  test is a `*.test.tsx` that starts with `// @vitest-environment jsdom`. An
  e2e spec goes in `tests/e2e/`.
- **Database:** call `createTestDb()` from `src/server/db/test-db.ts` and
  `destroy()` it in `afterEach`; that rolls the test back.
  `src/server/db/seed-demo.test.ts` shows the pattern.
- **E2E helpers:** `tests/e2e/fixtures.ts` has the seeds (`seedProject`,
  `seedParticipant`, `seedInvitation`), `signIn` through Mailpit and
  `expectAxeClean`. Call `expectAxeClean(page)` on every page a spec visits,
  in English and Dutch.
- **Data:** use invented names and `example.test` addresses only.
- **Error paths:** every refusal or failure a change adds gets a test that
  asserts it.

## Try it by hand

The demo projects give you one project in each phase in one command. Start
the whole stack, migrate, and load them with your own address as
facilitator:

```sh
scripts/dev/compose.sh up -d
scripts/dev/compose.sh exec dev pnpm db:migrate
scripts/dev/compose.sh exec dev pnpm db:seed-demo --facilitator you@example.test
```

Sign in at <http://localhost:3000/sign-in> and open the link from Mailpit at
<http://localhost:8025>. Then work through these steps:

1. **Scope, as facilitator:** open "Body temperature (demo)". It opens on
   the Overview, with the checklist for the scope phase; the Scope tab shows
   the concept, use cases and three comments. Move the project on to
   discover with "Go on to Discover" at the end of the checklist.
2. **Discover:** open "Heart rate (demo)". The Overview lists the parts of
   discover. "Review" on the first item opens Existing models: the pulse
   archetype from openEHR CKM (stored in `tests/fixtures/ckm`, no network)
   with its elements on the list. Three participants took the first look, so
   the Elements tab shows their answers counted per element; five of eight
   brainstormed privately, with "Heart rate" twice. Sign in as
   `gp.a@example.test` in a private window, who has not taken the first look
   yet. "Your turn" starts the first look; answer a few, then
   "Add what is missing" opens the board with one column per question, the
   archetype's elements dashed and the others' elements as a count. Add one
   in a column with Enter. Tick "Refers to another model" under a column's
   field to add an element that stands for a whole model, such as a zib, with
   its title and a link; its card names the model. As facilitator, reveal the board, merge the
   duplicate, then "Group" on the Overview: drag an element to another group
   (with the mouse or a finger) or click it and choose "Move here", rename a
   group and "Ask the group to check". As `gp.a@example.test`, "Your turn"
   now asks to check the groups.
3. **Decide:** open "Blood pressure (demo)". On the Elements tab, link an
   element to a CKM archetype element (this calls the live CKM). Round 1 is closed: 5 elements in
   the model, 1 not in the model and 2 without consensus. Round 2 is open;
   its rating card names each element's group and the overview lists the
   ratings under group headings. "Scope" and "Discover" in the header are
   done: each opens a read-only recap of that phase.
4. Open the People tab. Eight participants sit in five stakeholder groups:
   Nursing, Primary care, General medicine, Terminology and Architecture.
   Invite a new address and open the invitation from Mailpit in a private
   window.
5. **Detail:** open "Oxygen saturation (demo)". The Details tab lists the
   three elements in the model. SpO2 is settled, and its LOINC code waits
   for the group: the demo has one terminologist, so the review was
   skipped with a reason. The architect's proposal for "Inspired oxygen"
   has one open objection: mark it addressed with a note, then settle it.
   Sign in as `terminologist.a@example.test` to propose its codes. Sign in as `architect.a@example.test` to propose
   the structure of "Probe site", and as `nurse.b@example.test` to answer
   it from "Your turn".
6. **Hand-off:** open "Respiratory rate (demo)". Two rounds are closed;
   round 2 settled one of the two elements without consensus. Export the
   elements as CSV and as a mind map from the Overview.
7. **As participant,** sign in as `nurse.a@example.test` in a private window.
   The project list shows what waits per project. Open Blood pressure: its
   home shows "Your turn: rate round 2" and what is decided so far. Rate the
   two elements. You should see no other participant's ratings, and no
   names unless the facilitator turns that setting on. "About this project"
   at the bottom shows the groups and "Leave project".
8. Switch the language to Dutch and repeat a few steps.

To start over, drop the development database and run the commands again:

```sh
scripts/dev/compose.sh down -v
```

This removes the database volume and everything in it.

## What the tests do not cover yet

- The e2e suite runs on desktop Chromium only, not Firefox, Safari or a
  phone screen.
- axe finds part of the accessibility problems. Nobody has tested the app
  with a screen reader yet.
- Nobody has opened the mind map export in Freeplane or XMind yet.
- Sign-in e-mail goes to Mailpit only. Delivery through a real SMTP server,
  and mail filters that open links before the person does, are untested.
- There is no load test and no security test.
