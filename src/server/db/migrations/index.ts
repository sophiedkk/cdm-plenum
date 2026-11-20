// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Explicit migration registry. Static imports keep migrations type-checked and bundle-safe;
// names sort alphabetically, so always prefix new files with the next number.
import type { Migration, MigrationProvider } from "kysely/migration";
import * as m0001 from "./0001_auth.ts";
import * as m0002 from "./0002_projects.ts";
import * as m0003 from "./0003_access.ts";
import * as m0004 from "./0004_panel.ts";
import * as m0005 from "./0005_accounts.ts";
import * as m0006 from "./0006_group_names_and_raters.ts";
import * as m0008 from "./0008_round_proposals.ts";

export const migrations: Record<string, Migration> = {
  "0001_auth": m0001,
  "0002_projects": m0002,
  "0003_access": m0003,
  "0004_panel": m0004,
  "0005_accounts": m0005,
  "0006_group_names_and_raters": m0006,
  "0008_round_proposals": m0008,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: () => Promise.resolve(migrations),
};
