// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A third consent answer on a detail proposal (DT2, owner decision 2026-11-25): "leave" hands the
// decision to the experts. It carries no reason, and the column check says so, as for "agree".
import { type Kysely, sql } from "kysely";

const textCheck = sql`length(btrim(reason)) > 0 and length(reason) <= 2000`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("detail_answer")
    .dropConstraint("detail_answer_answer_check")
    .execute();
  await db.schema
    .alterTable("detail_answer")
    .dropConstraint("detail_answer_reason_check")
    .execute();
  await db.schema
    .alterTable("detail_answer")
    .addCheckConstraint(
      "detail_answer_answer_check",
      sql`answer in ('agree', 'objection', 'leave')`,
    )
    .execute();
  await db.schema
    .alterTable("detail_answer")
    .addCheckConstraint(
      "detail_answer_reason_check",
      sql`(answer in ('agree', 'leave') and reason is null) or (answer = 'objection' and reason is not null and ${textCheck})`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // The older check has no place for the answer, so those answers go with it.
  await sql`delete from detail_answer where answer = 'leave'`.execute(db);
  await db.schema
    .alterTable("detail_answer")
    .dropConstraint("detail_answer_answer_check")
    .execute();
  await db.schema
    .alterTable("detail_answer")
    .dropConstraint("detail_answer_reason_check")
    .execute();
  await db.schema
    .alterTable("detail_answer")
    .addCheckConstraint("detail_answer_answer_check", sql`answer in ('agree', 'objection')`)
    .execute();
  await db.schema
    .alterTable("detail_answer")
    .addCheckConstraint(
      "detail_answer_reason_check",
      sql`(answer = 'agree' and reason is null) or (answer = 'objection' and reason is not null and ${textCheck})`,
    )
    .execute();
}
