// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// How a project runs (PR14, ADR 0023): as a Delphi study (anonymous, 1 to 9 scale) or as a
// Team (named, consent rounds). Existing projects stay Delphi studies.
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("project")
    .addColumn("mode", "text", (col) => col.notNull().defaultTo("delphi"))
    .execute();
  await db.schema
    .alterTable("project")
    .addCheckConstraint("project_mode_check", sql`mode in ('delphi', 'team')`)
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("project").dropColumn("mode").execute();
}
