// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The base model of a project (EL25, ADR 0021): one source model in the coverage table that the
// others are compared with, as a zib 2.0 derives from one international model (Architectuur
// zibs 2.0, P4.3). A partial unique index allows at most one per project.
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("source_model")
    .addColumn("is_base", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();
  await db.schema
    .alterTable("source_model")
    // Only a model with a column in the coverage table (EL20) can be the base.
    .addCheckConstraint(
      "source_model_base_check",
      sql`not is_base or (status <> 'suggested' and kind <> 'other')`,
    )
    .execute();
  await sql`
    create unique index source_model_base_unique on source_model (project_id) where is_base
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index source_model_base_unique`.execute(db);
  await db.schema.alterTable("source_model").dropConstraint("source_model_base_check").execute();
  await db.schema.alterTable("source_model").dropColumn("is_base").execute();
}
