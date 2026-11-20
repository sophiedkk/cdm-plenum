// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The private-first brainstorm (EL13) and the question an element answers (EL14), ADR 0012.
import { type Kysely, sql } from "kysely";

/** The four brainstorm questions; src/lib/brainstorm.ts agrees. */
export const ELEMENT_PROMPT_KEYS = ["recorded", "patient_state", "method", "context"] as const;

const inList = (keys: readonly string[]) => sql.join(keys.map((key) => sql.lit(key)));

export async function up(db: Kysely<unknown>): Promise<void> {
  // NOTE: EL13, owner decision 2026-11-20: a new project starts with the private step on.
  await db.schema
    .alterTable("project")
    .addColumn("private_brainstorm", "boolean", (col) => col.notNull().defaultTo(true))
    .addColumn("board_revealed_at", "timestamptz")
    .execute();
  // Projects that exist already have a shared board; they stay visible as they were.
  await sql`update project set board_revealed_at = now()`.execute(db);

  await db.schema.alterTable("element").addColumn("prompt", "text").execute();
  await db.schema
    .alterTable("element")
    .addCheckConstraint(
      "element_prompt_check",
      sql`prompt is null or prompt in (${inList(ELEMENT_PROMPT_KEYS)})`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("element").dropConstraint("element_prompt_check").execute();
  await db.schema.alterTable("element").dropColumn("prompt").execute();
  await db.schema.alterTable("project").dropColumn("board_revealed_at").execute();
  await db.schema.alterTable("project").dropColumn("private_brainstorm").execute();
}
