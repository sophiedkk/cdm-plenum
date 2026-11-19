#!/usr/bin/env bash
# SPDX-FileCopyrightText: Sophie de Klerk
# SPDX-License-Identifier: Apache-2.0
#
# Runs a pnpm command in a one-off development container.
set -euo pipefail

exec "$(dirname "$0")/compose.sh" run --rm --no-deps dev pnpm "$@"
