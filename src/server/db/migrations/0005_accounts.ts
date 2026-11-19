// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Account administration (AD1, AD2): an administrator deactivates an account, and reads the
// activity log filtered by action.
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  // NOTE: AD1. A timestamp, not a deletion: the account's ratings and authorship stay, and the
  // address cannot get a fresh account through a new invitation.
  await db.schema.alterTable("user").addColumn("deactivated_at", "timestamptz").execute();
  await db.schema
    .createIndex("activity_log_action_occurred_at_idx")
    .on("activity_log")
    .columns(["action", "occurred_at"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("activity_log_action_occurred_at_idx").execute();
  await db.schema.alterTable("user").dropColumn("deactivated_at").execute();
}
