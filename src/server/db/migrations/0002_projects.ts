// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The cdm-plenum tables of docs/architecture.md#data: projects, scope, elements, rounds and
// ratings, and the activity log. A project is a better-auth organization (ADR 0004); ratings carry
// a rating code, never a member id (ADR 0005).
import { type Kysely, sql } from "kysely";

// NOTE: ADR 0009. The data type keys are written out here so this migration never changes when
// src/lib/data-types.ts does; a test checks that both lists agree.
export const DATA_TYPE_KEYS = [
  "text",
  "coded_text",
  "quantity",
  "count",
  "ordinal",
  "scale",
  "proportion",
  "boolean",
  "date",
  "date_time",
  "time",
  "duration",
  "quantity_interval",
  "date_time_interval",
  "identifier",
  "multimedia",
  "uri",
] as const;

const uuidv7 = sql`uuidv7()`;
const now = sql`now()`;
const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("project")
    .addColumn("id", "text", (col) =>
      col.primaryKey().references("organization.id").onDelete("cascade"),
    )
    .addColumn("phase", "text", (col) => col.notNull().defaultTo("scope"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addCheckConstraint(
      "project_phase_check",
      sql`phase in (${inList(["scope", "discover", "decide", "handoff"])})`,
    )
    .execute();

  await db.schema
    .createTable("scope_statement")
    .addColumn("project_id", "text", (col) =>
      col.primaryKey().references("project.id").onDelete("cascade"),
    )
    .addColumn("concept", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("use_cases", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("out_of_scope", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .execute();

  await db.schema
    .createTable("scope_source")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuidv7))
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("project.id").onDelete("cascade"),
    )
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("url", "text")
    .addUniqueConstraint("scope_source_position_unique", ["project_id", "position"])
    .execute();

  await db.schema
    .createTable("scope_comment")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuidv7))
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("project.id").onDelete("cascade"),
    )
    .addColumn("author_member_id", "text", (col) =>
      col.references("member.id").onDelete("set null"),
    )
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .execute();

  await db.schema
    .createTable("element")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuidv7))
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("project.id").onDelete("cascade"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("data_type", "text")
    .addColumn("min_occurs", "smallint")
    .addColumn("max_occurs", "integer")
    .addColumn("merged_into", "uuid", (col) => col.references("element.id").onDelete("set null"))
    // Never selected in a participant query (EL2, ADR 0005).
    .addColumn("author_member_id", "text", (col) =>
      col.references("member.id").onDelete("set null"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addCheckConstraint("element_name_check", sql`length(btrim(name)) > 0`)
    .addCheckConstraint(
      "element_data_type_check",
      sql`data_type is null or data_type in (${inList(DATA_TYPE_KEYS)})`,
    )
    .addCheckConstraint(
      "element_cardinality_check",
      sql`(min_occurs is null and max_occurs is null) or (min_occurs is not null and min_occurs in (0, 1) and (max_occurs is null or (max_occurs >= 1 and max_occurs >= min_occurs)))`,
    )
    .addCheckConstraint(
      "element_not_merged_into_itself",
      sql`merged_into is null or merged_into <> id`,
    )
    .execute();
  await db.schema
    .createIndex("element_project_id_idx")
    .on("element")
    .column("project_id")
    .execute();

  await db.schema
    .createTable("element_source")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuidv7))
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("label", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addCheckConstraint(
      "element_source_kind_check",
      sql`kind in (${inList(["brainstorm", "csv", "ckm"])})`,
    )
    .execute();
  await db.schema
    .createIndex("element_source_element_id_idx")
    .on("element_source")
    .column("element_id")
    .execute();

  await db.schema
    .createTable("element_ckm_link")
    .addColumn("element_id", "uuid", (col) =>
      col.primaryKey().references("element.id").onDelete("cascade"),
    )
    .addColumn("archetype_id", "text", (col) => col.notNull())
    .addColumn("cid", "text", (col) => col.notNull())
    .addColumn("revision", "text", (col) => col.notNull())
    .addColumn("at_code", "text", (col) => col.notNull())
    .addColumn("ckm_element_name", "text", (col) => col.notNull())
    .addColumn("rm_type", "text", (col) => col.notNull())
    .addColumn("linked_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .execute();

  await db.schema
    .createTable("element_value")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuidv7))
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("value", "numeric")
    .addUniqueConstraint("element_value_position_unique", ["element_id", "position"])
    .execute();

  await db.schema
    .createTable("element_comment")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuidv7))
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    // Never selected in a participant query (EL6, ADR 0005).
    .addColumn("author_member_id", "text", (col) =>
      col.references("member.id").onDelete("set null"),
    )
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .execute();
  await db.schema
    .createIndex("element_comment_element_id_idx")
    .on("element_comment")
    .column("element_id")
    .execute();

  await db.schema
    .createTable("round")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuidv7))
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("project.id").onDelete("cascade"),
    )
    .addColumn("number", "integer", (col) => col.notNull())
    // NOTE: DE1. The defaults are the COMET Handbook rule (https://doi.org/10.1186/s13063-017-1978-4):
    // 1 to 9 scale; at least 70% in the top band 7 to 9 and at most 15% in the bottom band 1 to 3.
    .addColumn("scale_min", "smallint", (col) => col.notNull().defaultTo(1))
    .addColumn("scale_max", "smallint", (col) => col.notNull().defaultTo(9))
    .addColumn("bottom_band_max", "smallint", (col) => col.notNull().defaultTo(3))
    .addColumn("top_band_min", "smallint", (col) => col.notNull().defaultTo(7))
    .addColumn("agreement_pct", "numeric(5, 2)", (col) => col.notNull().defaultTo(70))
    .addColumn("opposition_pct", "numeric(5, 2)", (col) => col.notNull().defaultTo(15))
    .addColumn("facilitator_sees_raters", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("closes_at", "timestamptz", (col) => col.notNull())
    .addColumn("opened_at", "timestamptz")
    .addColumn("closed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addUniqueConstraint("round_number_unique", ["project_id", "number"])
    .addCheckConstraint("round_number_check", sql`number >= 1`)
    .addCheckConstraint(
      "round_scale_check",
      sql`scale_min < scale_max and scale_min <= bottom_band_max and bottom_band_max < top_band_min and top_band_min <= scale_max`,
    )
    .addCheckConstraint(
      "round_pct_check",
      sql`agreement_pct > 50 and agreement_pct <= 100 and opposition_pct >= 0 and opposition_pct < agreement_pct`,
    )
    .addCheckConstraint(
      "round_closed_after_opened_check",
      sql`closed_at is null or (opened_at is not null and closed_at >= opened_at)`,
    )
    .execute();

  // NOTE: DE2. The database refuses a change to the rule, the closing date or the rater setting
  // once a round is open, so no code path can move the goalposts after the first rating.
  await sql`
    create function round_rule_locked() returns trigger language plpgsql as $$
    begin
      if old.opened_at is not null and (
        new.scale_min, new.scale_max, new.bottom_band_max, new.top_band_min,
        new.agreement_pct, new.opposition_pct, new.facilitator_sees_raters, new.closes_at,
        new.opened_at, new.project_id, new.number
      ) is distinct from (
        old.scale_min, old.scale_max, old.bottom_band_max, old.top_band_min,
        old.agreement_pct, old.opposition_pct, old.facilitator_sees_raters, old.closes_at,
        old.opened_at, old.project_id, old.number
      ) then
        raise exception 'round_rule_locked' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);
  await sql`
    create trigger round_rule_locked before update on round
    for each row execute function round_rule_locked()
  `.execute(db);

  await db.schema
    .createTable("round_element")
    .addColumn("round_id", "uuid", (col) =>
      col.notNull().references("round.id").onDelete("cascade"),
    )
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    .addColumn("outcome", "text")
    .addPrimaryKeyConstraint("round_element_pk", ["round_id", "element_id"])
    .addCheckConstraint(
      "round_element_outcome_check",
      sql`outcome is null or outcome in (${inList(["included", "excluded", "no_consensus"])})`,
    )
    .execute();

  // NOTE: ADR 0005. A random v4 code, not uuidv7, so the code reveals nothing about join order.
  await db.schema
    .createTable("rating_code")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("project.id").onDelete("cascade"),
    )
    .addColumn("member_id", "text", (col) =>
      col.notNull().references("member.id").onDelete("cascade"),
    )
    .addUniqueConstraint("rating_code_member_unique", ["project_id", "member_id"])
    .execute();

  await db.schema
    .createTable("rating")
    .addColumn("round_id", "uuid", (col) => col.notNull())
    .addColumn("element_id", "uuid", (col) => col.notNull())
    .addColumn("rating_code_id", "uuid", (col) =>
      col.notNull().references("rating_code.id").onDelete("restrict"),
    )
    // Null is "unable to rate" (DE3).
    .addColumn("score", "smallint")
    .addColumn("reason", "text")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addPrimaryKeyConstraint("rating_pk", ["round_id", "element_id", "rating_code_id"])
    .addForeignKeyConstraint(
      "rating_round_element_fk",
      ["round_id", "element_id"],
      "round_element",
      ["round_id", "element_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .execute();

  // NOTE: DE3, Q-AUDIT-1. A rating is accepted only while its round is open, with a score inside
  // the round's scale and a rating code of the round's project.
  await sql`
    create function rating_in_open_round() returns trigger language plpgsql as $$
    declare r round%rowtype;
    begin
      select * into r from round where id = new.round_id;
      if r.opened_at is null or r.closed_at is not null or now() > r.closes_at then
        raise exception 'rating_round_not_open' using errcode = 'check_violation';
      end if;
      if new.score is not null and (new.score < r.scale_min or new.score > r.scale_max) then
        raise exception 'rating_score_out_of_scale' using errcode = 'check_violation';
      end if;
      if not exists (
        select 1 from rating_code c where c.id = new.rating_code_id and c.project_id = r.project_id
      ) then
        raise exception 'rating_code_wrong_project' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);
  await sql`
    create trigger rating_in_open_round before insert or update on rating
    for each row execute function rating_in_open_round()
  `.execute(db);

  await db.schema
    .createTable("activity_log")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(uuidv7))
    .addColumn("occurred_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addColumn("actor_user_id", "text", (col) => col.references("user.id").onDelete("set null"))
    .addColumn("project_id", "text", (col) => col.references("project.id").onDelete("set null"))
    .addColumn("action", "text", (col) => col.notNull())
    .addColumn("target_type", "text")
    .addColumn("target_id", "text")
    .execute();
  await db.schema
    .createIndex("activity_log_occurred_at_idx")
    .on("activity_log")
    .column("occurred_at")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    "activity_log",
    "rating",
    "rating_code",
    "round_element",
    "round",
    "element_comment",
    "element_value",
    "element_ckm_link",
    "element_source",
    "element",
    "scope_comment",
    "scope_source",
    "scope_statement",
    "project",
  ]) {
    await db.schema.dropTable(table).execute();
  }
  await sql`drop function rating_in_open_round()`.execute(db);
  await sql`drop function round_rule_locked()`.execute(db);
}
