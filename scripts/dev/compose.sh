#!/usr/bin/env bash
# SPDX-FileCopyrightText: Sophie de Klerk
# SPDX-License-Identifier: Apache-2.0
#
# Runs compose on the development stack with Podman, or with Docker when
# Podman is not installed.
set -euo pipefail

cd "$(dirname "$0")/../.."

if command -v podman >/dev/null 2>&1; then
  engine=(podman compose)
elif command -v docker >/dev/null 2>&1; then
  engine=(docker compose)
else
  echo "compose.sh: neither podman nor docker is installed" >&2
  exit 1
fi

exec "${engine[@]}" -f compose.dev.yaml "$@"
