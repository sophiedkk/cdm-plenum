// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Light marks after the reveal (EL16, ADR 0012): "I support this" and "same as" another element.
// A mark carries the member id, as a comment does: these are discover-phase marks, not ratings,
// and no participant query selects the member (EL2, ADR 0005). A mark goes with its member.
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("element_support")
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    // Never selected in a participant query (EL16, EL2).
    .addColumn("member_id", "text", (col) =>
      col.notNull().references("member.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("element_support_pkey", ["element_id", "member_id"])
    .execute();
  await db.schema
    .createIndex("element_support_member_id_idx")
    .on("element_support")
    .column("member_id")
    .execute();

  await db.schema
    .createTable("element_same_as")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    .addColumn("same_as_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    // Never selected in a participant query (EL16, EL2).
    .addColumn("member_id", "text", (col) =>
      col.notNull().references("member.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint("element_same_as_not_itself", sql`element_id <> same_as_id`)
    .execute();
  // "A is the same as B" and "B is the same as A" are one pair, so a member marks it once.
  await sql`
    create unique index element_same_as_pair_unique on element_same_as
    (member_id, least(element_id, same_as_id), greatest(element_id, same_as_id))
  `.execute(db);
  await db.schema
    .createIndex("element_same_as_element_id_idx")
    .on("element_same_as")
    .column("element_id")
    .execute();
  await db.schema
    .createIndex("element_same_as_same_as_id_idx")
    .on("element_same_as")
    .column("same_as_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("element_same_as").execute();
  await db.schema.dropTable("element_support").execute();
}
