<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0008. Compose on one host, developed with Podman

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner

## Context and problem statement

The owner develops larger applications in containers so runtimes and
services stay off the host, using Podman. The production host for a research
or teaching group is one virtual machine.

## Considered options

1. A Compose file that runs with `podman compose` (and Docker Compose), for
   development and production.
2. Install Node.js and PostgreSQL on the host for development.

## Decision outcome

Option 1. `compose.yaml` runs the app and PostgreSQL; `compose.dev.yaml` runs
PostgreSQL and Mailpit for local development. The app image is built from a
`Containerfile`.

### Consequences

- Good: a clean machine starts the whole stack with one command (Q-MAINT-2).
- Bad: Podman and Docker differ in small ways (rootless networking, volume
  permissions); the dev scripts must work on both.
