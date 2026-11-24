// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Value rounds (DT3, owner decision 2026-11-24): a round of kind `values` rates the values of
// one or more structure proposals, each value an item under its element's name. Its lists, its
// values and their ratings live in tables of their own, so every query of an element round
// (round_element, rating) stays as it was. A value rating carries the rating code, never a member
// id, as a rating does (ADR 0005), and the same trigger accepts it only while the round is open.
import { type Kysely, sql } from "kysely";

/** The kinds of a round; src/server/rounds/round.ts agrees. */
export const ROUND_KINDS = ["elements", "values"] as const;

const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("round")
    .addColumn("kind", "text", (col) => col.notNull().defaultTo("elements"))
    .execute();
  await db.schema
    .alterTable("round")
    .addCheckConstraint("round_kind_check", sql`kind in (${inList(ROUND_KINDS)})`)
    .execute();
  // NOTE: DT3, our own design. Both kinds share the project's round numbers, so "round 3" names
  // one round.
  await sql`
    create function round_kind_fixed() returns trigger language plpgsql as $$
    begin
      if new.kind is distinct from old.kind then
        raise exception 'round_kind_fixed' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);
  await sql`
    create trigger round_kind_fixed before update of kind on round
    for each row execute function round_kind_fixed()
  `.execute(db);

  // One row per structure proposal whose values the round rates, with the version it rates and,
  // once applied, the version applying made (DT3).
  await db.schema
    .createTable("round_value_list")
    .addColumn("round_id", "uuid", (col) =>
      col.notNull().references("round.id").onDelete("cascade"),
    )
    .addColumn("proposal_id", "uuid", (col) =>
      col.notNull().references("detail_proposal.id").onDelete("cascade"),
    )
    .addColumn("version", "integer", (col) => col.notNull())
    .addColumn("applied_version", "integer")
    .addColumn("applied_at", "timestamptz")
    .addPrimaryKeyConstraint("round_value_list_pkey", ["round_id", "proposal_id"])
    .addCheckConstraint(
      "round_value_list_applied_check",
      sql`(applied_version is null and applied_at is null) or (applied_version > version and applied_at is not null)`,
    )
    .execute();
  await db.schema
    .createIndex("round_value_list_proposal_id_idx")
    .on("round_value_list")
    .column("proposal_id")
    .execute();

  // NOTE: DT3, our own design. A row per value with its own random id and a copy of its text and
  // number: a later version replaces the proposal's values, and a closed round keeps what it rated.
  await db.schema
    .createTable("round_value")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("round_id", "uuid", (col) => col.notNull())
    .addColumn("proposal_id", "uuid", (col) => col.notNull())
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("value", "numeric")
    .addColumn("outcome", "text")
    .addForeignKeyConstraint(
      "round_value_list_fk",
      ["round_id", "proposal_id"],
      "round_value_list",
      ["round_id", "proposal_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addUniqueConstraint("round_value_position_unique", ["round_id", "proposal_id", "position"])
    .addUniqueConstraint("round_value_round_unique", ["round_id", "id"])
    .addCheckConstraint(
      "round_value_outcome_check",
      sql`outcome is null or outcome in (${inList(["included", "excluded", "no_consensus"])})`,
    )
    .execute();

  await db.schema
    .createTable("value_rating")
    .addColumn("round_id", "uuid", (col) => col.notNull())
    .addColumn("value_id", "uuid", (col) => col.notNull())
    .addColumn("rating_code_id", "uuid", (col) =>
      col.notNull().references("rating_code.id").onDelete("restrict"),
    )
    // The rater's stakeholder group when they last saved the rating (DE5, Q-PRIV-3).
    .addColumn("team_id", "text", (col) => col.references("team.id").onDelete("set null"))
    // Null is "unable to rate" (DE3).
    .addColumn("score", "smallint")
    .addColumn("reason", "text")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("value_rating_pkey", ["round_id", "value_id", "rating_code_id"])
    .addForeignKeyConstraint(
      "value_rating_value_fk",
      ["round_id", "value_id"],
      "round_value",
      ["round_id", "id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();
  await db.schema
    .createIndex("value_rating_round_id_team_id_idx")
    .on("value_rating")
    .columns(["round_id", "team_id"])
    .execute();
  // NOTE: DE3, Q-AUDIT-1. The trigger of migration 0002 reads only round_id, score and
  // rating_code_id, so it guards a value rating as it guards a rating.
  await sql`
    create trigger rating_in_open_round before insert or update on value_rating
    for each row execute function rating_in_open_round()
  `.execute(db);

  // NOTE: DT3. An element round rates elements and takes proposals (DE16); a value round rates
  // value lists only. The database refuses an item of the wrong kind from any code path.
  await sql`
    create function round_item_kind() returns trigger language plpgsql as $$
    declare k text;
    begin
      select kind into k from round where id = new.round_id;
      if (tg_table_name = 'round_value_list') <> (k = 'values') then
        raise exception 'round_item_kind' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);
  for (const table of ["round_element", "round_proposal", "round_value_list"]) {
    await sql`
      create trigger round_item_kind before insert or update on ${sql.table(table)}
      for each row execute function round_item_kind()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ["round_element", "round_proposal", "round_value_list"]) {
    await sql`drop trigger round_item_kind on ${sql.table(table)}`.execute(db);
  }
  await sql`drop function round_item_kind()`.execute(db);
  await db.schema.dropTable("value_rating").execute();
  await db.schema.dropTable("round_value").execute();
  await db.schema.dropTable("round_value_list").execute();
  // NOTE: no spec governs this, our own design: before DT3 every round rates elements, so the
  // value rounds go and the element rounds keep their numbers.
  await sql`delete from round where kind = 'values'`.execute(db);
  await sql`drop trigger round_kind_fixed on round`.execute(db);
  await sql`drop function round_kind_fixed()`.execute(db);
  await db.schema.alterTable("round").dropColumn("kind").execute();
}
