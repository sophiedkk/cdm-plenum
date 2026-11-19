#!/usr/bin/env bash
# SPDX-FileCopyrightText: Sophie de Klerk
# SPDX-License-Identifier: Apache-2.0
#
# Runs the e2e suite in its own container: builds the app, starts it on its
# own port against its own database and runs Playwright with Chromium. Needs
# PostgreSQL and Mailpit of the dev stack (scripts/dev/compose.sh up -d
# postgres mailpit). Arguments go to `pnpm test:e2e`, for example a spec file
# or `--grep "sign-in"`.
set -euo pipefail

cd "$(dirname "$0")/../.."

if command -v podman >/dev/null 2>&1; then
  engine=podman
elif command -v docker >/dev/null 2>&1; then
  engine=docker
else
  echo "e2e.sh: neither podman nor docker is installed" >&2
  exit 1
fi

PLAYWRIGHT_VERSION="$(sed -n 's/^ *"@playwright\/test": "\([^"]*\)".*/\1/p' package.json)"
if [[ -z "${PLAYWRIGHT_VERSION}" ]]; then
  echo "e2e.sh: package.json pins no @playwright/test version" >&2
  exit 1
fi
export PLAYWRIGHT_VERSION

image="localhost/cdm-plenum-e2e:${PLAYWRIGHT_VERSION}"
if ! "${engine}" image inspect "${image}" >/dev/null 2>&1; then
  "${engine}" build -f Containerfile.e2e \
    --build-arg "PLAYWRIGHT_VERSION=${PLAYWRIGHT_VERSION}" -t "${image}" .
fi

# --no-deps: the suite uses the running PostgreSQL and Mailpit and never
# starts, recreates or stops a service of the shared stack.
exec scripts/dev/compose.sh --profile e2e run --rm --no-deps e2e pnpm test:e2e "$@"
