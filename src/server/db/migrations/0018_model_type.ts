// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The model type of a project (SC4, ADR 0021): one of the openEHR entry types that zib 2.0
// follows (Architectuur zibs 2.0, P4.2), chosen by the facilitator in the scope phase. Null
// until chosen, so projects from before this migration keep working.
import { type Kysely, sql } from "kysely";

/** The model types; src/lib/model-types.ts agrees. */
export const MODEL_TYPE_KEYS = [
  "observation",
  "evaluation",
  "instruction",
  "action",
  "cluster",
] as const;

const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("project").addColumn("model_type", "text").execute();
  await db.schema
    .alterTable("project")
    .addCheckConstraint(
      "project_model_type_check",
      sql`model_type is null or model_type in (${inList(MODEL_TYPE_KEYS)})`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("project").dropConstraint("project_model_type_check").execute();
  await db.schema.alterTable("project").dropColumn("model_type").execute();
}
