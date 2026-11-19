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

The demo project gives you a filled board and a finished first round in one
command. Start the whole stack, migrate, and load it with your own address
as facilitator:

```sh
scripts/dev/compose.sh up -d
scripts/dev/compose.sh exec dev pnpm db:migrate
scripts/dev/compose.sh exec dev pnpm db:seed-demo --facilitator you@example.test
```

Sign in at <http://localhost:3000/sign-in> and open the link from Mailpit at
<http://localhost:8025>. Then work through these steps:

1. **As facilitator,** open "Blood pressure (demo)". The scope page shows the
   concept, use cases and sources, with comments.
2. Open the board. It has eight elements, such as Systolic, Cuff size and
   Comment. Add an element, merge two duplicates, and look up a CKM
   archetype (this calls the live CKM).
3. Open the rounds. Round 1 is closed: 5 elements included, 1 excluded and
   2 without consensus. Round 2 is open.
4. Open the members page. Eight participants sit in five stakeholder groups:
   Nursing, Primary care, General medicine, Terminology and Architecture.
   Invite a new address and open the invitation from Mailpit in a private
   window.
5. Export the elements as CSV and as a mind map.
6. **As participant,** sign in as `nurse.a@example.test` in a private window
   and rate the elements in round 2. You should see no other participant's
   ratings, and no names unless the facilitator turns that setting on.
7. Switch the language to Dutch and repeat a few steps.

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
