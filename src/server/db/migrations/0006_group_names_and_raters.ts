// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The owner decisions of 2026-11-19 on stakeholder groups and the panel: whether participants
// see who is in each group (PR7), and the reason for the project's own minimum panel (DE13).
// A facilitator who rates (DE14) needs no column: their group is a team membership, as a
// participant's is, and they have had a rating code since they created the project.
import { type Kysely, sql } from "kysely";

/** The longest reason for the project's own minimum panel; src/server/rounds/schemas.ts agrees. */
export const PANEL_MINIMUM_REASON_MAX = 500;

export async function up(db: Kysely<unknown>): Promise<void> {
  // NOTE: PR7, owner decision 2026-11-19: off by default, so a project names no one until the
  // facilitator chooses to.
  await db.schema
    .alterTable("project")
    .addColumn("group_names_visible", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();

  // NOTE: DE13, our own design for where it lives. One reason per project, next to the change
  // class, because the facilitator gives it for the set of counts in project_panel_minimum.
  await db.schema
    .alterTable("project")
    .addColumn("panel_minimum_reason", "text", (col) =>
      col.check(
        sql`panel_minimum_reason is null or (length(btrim(panel_minimum_reason)) > 0 and length(panel_minimum_reason) <= ${sql.lit(PANEL_MINIMUM_REASON_MAX)})`,
      ),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("project").dropColumn("panel_minimum_reason").execute();
  await db.schema.alterTable("project").dropColumn("group_names_visible").execute();
}
