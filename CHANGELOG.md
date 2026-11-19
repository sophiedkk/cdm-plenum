<!-- SPDX-FileCopyrightText: Sophie de Klerk -->
<!-- SPDX-License-Identifier: Apache-2.0 -->

# Changelog

All notable changes to cdm-plenum are recorded in this file. The format
follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and
the project uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

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
