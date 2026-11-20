// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Detail flags (DE17): while rating, a participant marks the data type, the cardinality or the
// values of an element as wrong, with a reason. A flag carries the rater's rating code, never a
// member id, as a rating does (ADR 0005); its own id is random, so it says nothing about order.
import { type Kysely, sql } from "kysely";

/** The details a flag can name; src/server/rounds/schemas.ts agrees. */
export const DETAIL_FLAG_KINDS = ["data_type", "cardinality", "values"] as const;
/** The longest flag reason, the rating reason's limit; src/server/rounds/schemas.ts agrees. */
export const DETAIL_FLAG_REASON_MAX = 2000;

const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("detail_flag")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("round_id", "uuid", (col) => col.notNull())
    .addColumn("element_id", "uuid", (col) => col.notNull())
    // NOTE: ADR 0005. Only rater-link.ts resolves the code to a person.
    .addColumn("rating_code_id", "uuid", (col) =>
      col.notNull().references("rating_code.id").onDelete("restrict"),
    )
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("reason", "text", (col) => col.notNull())
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addForeignKeyConstraint(
      "detail_flag_round_element_fk",
      ["round_id", "element_id"],
      "round_element",
      ["round_id", "element_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addUniqueConstraint("detail_flag_unique", ["round_id", "element_id", "rating_code_id", "kind"])
    .addCheckConstraint("detail_flag_kind_check", sql`kind in (${inList(DETAIL_FLAG_KINDS)})`)
    .addCheckConstraint(
      "detail_flag_reason_check",
      sql`length(btrim(reason)) > 0 and length(reason) <= ${sql.lit(DETAIL_FLAG_REASON_MAX)}`,
    )
    .execute();

  // NOTE: DE17, Q-AUDIT-1. A flag is accepted only while its round is open and from a rating
  // code of the round's project, against the database clock, as for a rating.
  await sql`
    create function detail_flag_in_open_round() returns trigger language plpgsql as $$
    declare r round%rowtype;
    begin
      select * into r from round where id = new.round_id;
      if r.opened_at is null or r.closed_at is not null or now() > r.closes_at then
        raise exception 'detail_flag_round_not_open' using errcode = 'check_violation';
      end if;
      if not exists (
        select 1 from rating_code c where c.id = new.rating_code_id and c.project_id = r.project_id
      ) then
        raise exception 'detail_flag_code_wrong_project' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);
  await sql`
    create trigger detail_flag_in_open_round before insert or update on detail_flag
    for each row execute function detail_flag_in_open_round()
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("detail_flag").execute();
  await sql`drop function detail_flag_in_open_round()`.execute(db);
}
