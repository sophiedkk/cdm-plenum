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
import * as m0007 from "./0007_private_brainstorm.ts";
import * as m0008 from "./0008_round_proposals.ts";
import * as m0009 from "./0009_detail_flags.ts";
import * as m0011 from "./0011_element_marks.ts";
import * as m0012 from "./0012_source_models.ts";
import * as m0013 from "./0013_first_look.ts";
import * as m0014 from "./0014_element_groups.ts";
import * as m0015 from "./0015_unmatched_source_elements.ts";
import * as m0016 from "./0016_detail_phase.ts";
import * as m0017 from "./0017_detail_terminology.ts";
import * as m0018 from "./0018_model_type.ts";
import * as m0019 from "./0019_base_model.ts";
import * as m0020 from "./0020_reference_element.ts";
import * as m0021 from "./0021_model_tree.ts";
import * as m0022 from "./0022_value_rounds.ts";
import * as m0023 from "./0023_team_member_left.ts";
import * as m0024 from "./0024_session_cap.ts";
import * as m0025 from "./0025_units.ts";
import * as m0026 from "./0026_tree_element_order.ts";

export const migrations: Record<string, Migration> = {
  "0001_auth": m0001,
  "0002_projects": m0002,
  "0003_access": m0003,
  "0004_panel": m0004,
  "0005_accounts": m0005,
  "0006_group_names_and_raters": m0006,
  "0007_private_brainstorm": m0007,
  "0008_round_proposals": m0008,
  "0009_detail_flags": m0009,
  "0011_element_marks": m0011,
  "0012_source_models": m0012,
  "0013_first_look": m0013,
  "0014_element_groups": m0014,
  "0015_unmatched_source_elements": m0015,
  "0016_detail_phase": m0016,
  "0017_detail_terminology": m0017,
  "0018_model_type": m0018,
  "0019_base_model": m0019,
  "0020_reference_element": m0020,
  "0021_model_tree": m0021,
  "0022_value_rounds": m0022,
  "0023_team_member_left": m0023,
  "0024_session_cap": m0024,
  "0025_units": m0025,
  "0026_tree_element_order": m0026,
};

export const migrationProvider: MigrationProvider = {
  getMigrations: () => Promise.resolve(migrations),
};
