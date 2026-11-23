// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// "Not the same" in the coverage table (EL20): the facilitator rejects a suggested match, by
// mapping or by name, and its source elements then stay out of every suggested match. A code
// match is applied and cannot be rejected.
import type { Kysely } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("source_element")
    .addColumn("unmatched", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("source_element").dropColumn("unmatched").execute();
}
