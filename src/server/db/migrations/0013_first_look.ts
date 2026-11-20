// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The first look at the elements from existing models (EL22, ADR 0020): each member's answer
// per element. An answer carries the member id, as a mark does (EL16): no participant query
// selects it (EL2, ADR 0005), and the answer goes with its member.
import { type Kysely, sql } from "kysely";

/** The answers to "Does this element belong to the concept?"; src/lib/first-look.ts agrees. */
export const FIRST_LOOK_ANSWER_KEYS = ["belongs", "not_sure", "not_belongs"] as const;

const inList = (keys: readonly string[]) => sql.join(keys.map((key) => sql.lit(key)));

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("first_look_answer")
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    // Never selected in a participant query (EL22, EL2).
    .addColumn("member_id", "text", (col) =>
      col.notNull().references("member.id").onDelete("cascade"),
    )
    .addColumn("answer", "text", (col) => col.notNull())
    .addColumn("answered_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("first_look_answer_pkey", ["element_id", "member_id"])
    .addCheckConstraint(
      "first_look_answer_check",
      sql`answer in (${inList(FIRST_LOOK_ANSWER_KEYS)})`,
    )
    .execute();
  await db.schema
    .createIndex("first_look_answer_member_id_idx")
    .on("first_look_answer")
    .column("member_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("first_look_answer").execute();
}
