<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0001. Record architecture decisions

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner

## Context and problem statement

cdm-plenum must stay maintainable by a new maintainer or an AI session
without prior context. Decisions made in a chat or a meeting are hard to find
later. The project needs a decision log in the repository.

## Considered options

- Architecture decision records in MADR format under `docs/adr/`.
- Decisions only in issues and pull requests.

## Decision outcome

Chosen option: **MADR records under `docs/adr/`**, as eduLIMS does. They sit
next to the code, are reviewed in the pull request that needs them, and keep
the rejected options.

### Consequences

- Good: every technology choice and its reasons are in one place.
- Bad: one more document to keep current.
- `docs/architecture.md` still describes the whole design; a decision that
  changes it updates that document in the same pull request.
