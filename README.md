<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# cdm-plenum

cdm-plenum guides a group of clinicians, information modellers and
terminologists from the scope of a clinical concept to an agreed list of data
elements: a common data model of the concept, before anyone writes it down
in a standard such as an openEHR archetype or a FHIR profile. The group starts
from existing models (openEHR archetypes from the Clinical Knowledge Manager,
FHIR profiles from a package), adds what is missing on a shared board, and
rates the elements in e-Delphi rounds against a consensus rule fixed in
advance. The elements in the model then get their structure by consent. The
agreed list goes to the existing authoring tools and to CKM review as CSV and
as a FreeMind mind map.

The project is in an early stage. The requirements draft is in
[docs/requirements.md](docs/requirements.md) and the design in
[docs/architecture.md](docs/architecture.md), with the decision records in
[docs/adr/](docs/adr/README.md).

## How it works

A project moves through five phases. The facilitator moves it on from the
project's Overview; participants see their task on the project home.

```mermaid
flowchart LR
    scope[Scope] --> discover[Discover] --> decide[Decide] --> detail[Detail] --> handoff[Hand-off]
    decide -- "no consensus: next round" --> decide
```

| Phase | What happens |
| --- | --- |
| Scope | The facilitator writes the concept, use cases and sources; participants comment. |
| Discover | The facilitator puts elements from existing models (CKM archetypes, FHIR profiles, forms) on the list and participants take a first look at them. Each participant then adds what is missing, alone, until the facilitator reveals the board, merges duplicates and groups the elements for the participants to check. |
| Decide | Participants rate each element anonymously in e-Delphi rounds against a consensus rule fixed in advance. Elements without consensus go to a next round with the group's scores. |
| Detail | The facilitator or an architect proposes the data type, cardinality and values of each element in the model; participants agree or object, and the facilitator settles. |
| Hand-off | The agreed elements are exported as CSV and as a mind map, the ratings for the study report. |

## Screenshots

The screenshots show the demo projects; their people are invented.

A participant's project home shows one "Your turn" card and what the group
has decided so far.

![The home page of Blood pressure in the decide phase, with the card to rate round 2](docs/screenshots/home.png)

The rating card asks one question per element on a scale of 1 to 9.

![The rating card of round 2 for the element Mean arterial pressure](docs/screenshots/rating.png)

The facilitator opens a project on its Overview: a checklist for the current
phase that ends in the move to the next phase.

![The Overview of Heart rate in the discover phase, with its checklist](docs/screenshots/overview.png)

## Run it locally

You need Podman (or Docker) with compose. Node.js and pnpm run inside the
development container, so you do not install them on your machine.

```sh
scripts/dev/pnpm.sh install     # install the dependencies in the dev container
scripts/dev/compose.sh up -d    # PostgreSQL, Mailpit and the dev server
```

Open <http://localhost:3000>. Mailpit shows the e-mails the app sends at
<http://localhost:8025>. Stop the stack with `scripts/dev/compose.sh down`.

There is no open registration. To sign in for the first time, give your
address the right to create projects, then ask for a sign-in link at
<http://localhost:3000/sign-in> and open it from Mailpit:

```sh
scripts/dev/compose.sh exec dev pnpm db:migrate
scripts/dev/compose.sh exec dev pnpm admin:grant you@example.test --facilitator
```

To try every phase at once, load the demo projects. Each has the same eight
invented participants in five stakeholder groups and stands in another
phase:

| Project | Phase | What it shows |
| --- | --- | --- |
| Body temperature (demo) | Scope | A scope statement with three comments |
| Heart rate (demo) | Discover | A private brainstorm by five participants, board not revealed yet |
| Blood pressure (demo) | Decide | A closed first round with results and an open second round |
| Oxygen saturation (demo) | Detail | One settled structure and one with an open objection |
| Respiratory rate (demo) | Hand-off | Two closed rounds, ready for export |

Your address becomes facilitator of every project and administrator of the
app. A second run adds only the projects that are missing.

```sh
scripts/dev/compose.sh exec dev pnpm db:seed-demo --facilitator you@example.test
```

The participants have `example.test` addresses (for example
`nurse.a@example.test`); sign in as one in a private window to see the
participant's view: their task on each project's home, the first look in
Heart rate, round 2 to rate in Blood pressure, and the structure proposals to
answer in Oxygen saturation.

Run the checks (typecheck, lint, unit tests) with `scripts/dev/pnpm.sh check`,
and the browser tests with `scripts/dev/e2e.sh`.
[docs/testing.md](docs/testing.md) explains the test suites, how to run part
of one, how to write a test, and a walkthrough to try the demo by hand.

## Run it in production

`compose.yaml` runs the app and PostgreSQL on one host behind a reverse
proxy with TLS. [docs/deployment.md](docs/deployment.md) covers the
settings, the first administrator, updates and backups.

## Use of AI

This project is developed with the help of an AI coding assistant (Claude
Code). The owner decides on the requirements and the design, and every change
goes through a pull request with automated checks.

## Licence

Apache License 2.0, see [LICENSE](LICENSE). Each file names its licence in an
SPDX header, and the full texts are in [`LICENSES/`](LICENSES/). The
components in `src/components/ui/` come from the shadcn/ui registry
(<https://ui.shadcn.com>) and stay under the MIT licence
([`LICENSES/MIT.txt`](LICENSES/MIT.txt)); everything else is Apache-2.0
([`LICENSES/Apache-2.0.txt`](LICENSES/Apache-2.0.txt)).
