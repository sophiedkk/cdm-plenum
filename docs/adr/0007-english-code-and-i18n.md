<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0007. English code and an English and Dutch UI with Paraglide

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner

## Context and problem statement

The first users are Dutch research and teaching groups; openEHR work and its
vocabulary are international. Q-I18N-1 asks for English and Dutch.

## Considered options

1. English code and docs; every UI text through Paraglide message
   catalogues, English source with a Dutch translation (as eduLIMS ADR 0011).
2. Dutch only.

## Decision outcome

Option 1. Code, docs, comments and commits are English. No user-visible text
is hard-coded; `messages/en.json` is the source and `messages/nl.json` the
translation.

### Consequences

- Good: openEHR terms stay as CKM uses them; the tool can be shared beyond
  the Netherlands.
- Bad: every UI change touches two catalogues.
