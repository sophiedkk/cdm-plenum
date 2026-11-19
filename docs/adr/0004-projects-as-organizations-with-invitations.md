<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# 0004. Projects as better-auth organizations, joined by invitation

- Status: Proposed
- Date: 2026-11-19
- Deciders: owner (invitation system), maintainer (design)

## Context and problem statement

A project has a facilitator, participants in stakeholder groups and
invitations (PR2, PR3). Panels include clinicians outside the institution, so
sign-in cannot depend on one institution's identity provider. The owner chose
an invitation system: no open registration (PR1).

## Considered options

1. Own tables for projects, memberships and invitations, with own sign-in.
2. The better-auth organization plugin for projects, roles, teams and
   invitations, with sign-in by e-mail link (magic link plugin).
3. As option 2, with e-mail and password sign-in.

## Decision outcome

Option 2, following eduLIMS ADR 0018 for the use of the organization plugin.

- **One project is one organization**; a **stakeholder group is a team**. The
  project roles `facilitator` and `participant` are a custom access control
  (`createAccessControl`). Teams are enabled; an invitation carries the team
  (better-auth organization plugin docs,
  <https://www.better-auth.com/docs/plugins/organization>).
- **Every write goes through cdm-plenum's own services** in
  `src/server/projects/` and `src/server/invitations/`, which check the
  project role in the query. The plugin's HTTP endpoints are disabled, as in
  eduLIMS.
- **Sign-in is by single-use e-mail link** (magic link plugin,
  <https://www.better-auth.com/docs/plugins/magic-link>). A user is created
  only for an e-mail address with a pending invitation or an administrator
  grant; a hook on user creation refuses every other address.
- **Invitations are sent by e-mail** through SMTP when it is configured. The
  facilitator can always copy an invitation link instead, so the tool works
  without SMTP in a classroom.
- **Signing in accepts the invitation** for that e-mail address and places the
  user in the invitation's team.

The plugin's default invitation lifetime is 48 hours; the lifetime cdm-plenum
uses is set when the requirements give one.

### Consequences

- Good: membership, roles and invitations come from a maintained library.
- Good: no passwords stored.
- Bad: sign-in depends on e-mail delivery; a participant without working
  e-mail cannot sign in.
- Bad: disabling the plugin's endpoints and keeping our own services means
  more code than the plugin's defaults.
