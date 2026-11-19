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

### Changes during implementation (#2)

- **Who creates a project (owner decision 2026-11-19).** Facilitator is also
  an application-wide right, granted and revoked by an administrator and
  stored with the administrator role in `app_role`, keyed by e-mail address.
  Only a holder of the right creates a project; the creator becomes the
  project's `facilitator` member. Revoking the right leaves existing projects
  and memberships alone. An invitation never grants the right.
- **Expert types (PR6, owner decision 2026-11-19).** A stakeholder group
  carries `expert_type` (`clinical`, `terminology` or `architecture`) as a
  team field, and a new project starts with nine default groups.
- **The plugin's endpoints are locked three ways**, as in eduLIMS ADR 0018:
  every path in `disabledPaths`, a before-hook that answers any
  `/organization` path with 404, and the plugin's own `before*` hooks refuse,
  so a server-side `auth.api` call cannot write either.
- **Signing in accepts every pending, unexpired invitation** for the verified
  address, in one transaction, not only the one whose link the invitee
  opened. A failed acceptance does not refuse the sign-in; the next sign-in
  tries again.
- **An address that may not sign in gets no e-mail.** The sign-in form
  answers the same for every address, so it does not tell which addresses
  have an account or an invitation.
- **An administrator grant is a command on the host**,
  `pnpm admin:grant <email> [--facilitator]`, until the administration
  screens of AD1 exist.

### Consequences

- Good: membership, roles and invitations come from a maintained library.
- Good: no passwords stored.
- Bad: sign-in depends on e-mail delivery; a participant without working
  e-mail cannot sign in.
- Bad: disabling the plugin's endpoints and keeping our own services means
  more code than the plugin's defaults.
