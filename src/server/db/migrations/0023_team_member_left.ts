// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The group a participant had when they left the project (PR5, DE6). Leaving deletes the
// team_member row, so without this row a closed round could no longer say how many raters its
// groups held when it closed, and its response rate would change after the fact (R-04).
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("team_member_left")
    .addColumn("team_id", "text", (col) => col.notNull().references("team.id").onDelete("cascade"))
    .addColumn("user_id", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("joined_at", "timestamptz", (col) => col.notNull())
    .addColumn("left_at", "timestamptz", (col) => col.notNull())
    .addPrimaryKeyConstraint("team_member_left_pkey", ["team_id", "user_id", "left_at"])
    .addCheckConstraint("team_member_left_order_check", sql`joined_at <= left_at`)
    .execute();
  await db.schema
    .createIndex("team_member_left_user_id_idx")
    .on("team_member_left")
    .column("user_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("team_member_left").execute();
}
