<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0002. Follow the eduLIMS stack, trimmed

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner

## Context and problem statement

cdm-plenum is a multi-user web application with forms, tables, rating rounds
and exports, and later a live workshop mode. It needs a stack the owner and
the people around her can maintain. eduLIMS
(<https://github.com/Vernum-Projecten/eduLIMS>) is a recent web application
in the same openEHR and education setting, with its stack, layout and working
discipline documented in the repository.

## Considered options

1. The eduLIMS stack and layout, trimmed to what cdm-plenum needs.
2. The eduLIMS stack in full, with its security and supply-chain gates.
3. A separate stack, for example Django with HTMX.

## Decision outcome

Option 1. cdm-plenum uses TanStack Start with full server-side rendering,
React, strict TypeScript, Biome, Kysely on PostgreSQL, better-auth,
Tailwind with shadcn/ui, Paraglide, Vitest and Playwright with axe, on Node.js
with pnpm. It takes over the eduLIMS layout
(`src/server/<area>/functions.ts`, `queries.ts`, `schemas.ts`), its
requirement IDs, ADRs and the merge flow (auto-merge of a
pull request when CI is green, review by convention). Shell scripts are bash. User-visible changes get an entry directly in
`CHANGELOG.md` instead of eduLIMS's `changelog.d/` fragments.

Left out until a new record adds them: SCIM provisioning, identity providers
managed at runtime, the vendored OWASP documents, SLSA provenance and the
project board scripts.

Exact versions are pinned in `package.json` when the project is scaffolded,
each checked on the npm registry at that moment.

### Consequences

- Good: patterns, rules and fixes from eduLIMS carry over directly.
- Good: one language from database to browser.
- Bad: TanStack Start moves fast; upgrades need attention.
- The live workshop mode needs real-time updates; how is decided in its own
  record.
