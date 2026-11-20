// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Proposals for missing elements in round 1 (DE16): the rule for adding them, set before the
// round opens, and the proposals themselves. A proposal carries the proposer's rating code,
// never a member id, as a rating does (ADR 0005). An element added from a proposal gets a
// `delphi` source.
import { type Kysely, sql } from "kysely";

/** The longest proposal rule, name and description; src/server/rounds/schemas.ts agrees. */
export const PROPOSAL_RULE_MAX = 500;
export const PROPOSAL_NAME_MAX = 200;
export const PROPOSAL_DESCRIPTION_MAX = 500;

const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));
const EARLIER_SOURCE_KINDS = ["brainstorm", "csv", "ckm"] as const;
/** The element source kinds after this migration; a test checks them against the board. */
export const ELEMENT_SOURCE_KIND_KEYS = [...EARLIER_SOURCE_KINDS, "delphi"] as const;

const LOCKED = [
  "scale_min",
  "scale_max",
  "bottom_band_max",
  "top_band_min",
  "agreement_pct",
  "opposition_pct",
  "facilitator_sees_raters",
  "closes_at",
  "opened_at",
  "project_id",
  "number",
  "panel_clinical",
  "minimum_clinical",
  "panel_terminology",
  "minimum_terminology",
  "panel_architecture",
  "minimum_architecture",
  "below_minimum_reason",
];

/** The DE2 lock of 0004, with the proposal rule when `withRule` is set. */
function lockFunction(withRule: boolean): string {
  const columns = withRule ? [...LOCKED, "proposal_rule"] : LOCKED;
  const list = (prefix: string) => columns.map((column) => `${prefix}.${column}`).join(", ");
  return `
    create or replace function round_rule_locked() returns trigger language plpgsql as $$
    begin
      if old.opened_at is not null and (
        ${list("new")}
      ) is distinct from (
        ${list("old")}
      ) then
        raise exception 'round_rule_locked' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `;
}

async function sourceKinds(db: Kysely<unknown>, kinds: readonly string[]): Promise<void> {
  await sql`alter table element_source drop constraint element_source_kind_check`.execute(db);
  await sql`alter table element_source add constraint element_source_kind_check check (kind in (${inList(kinds)}))`.execute(
    db,
  );
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // NOTE: DE16, COMET Handbook section 2.7.6. The rule is text the facilitator applies by hand;
  // only round 1 takes proposals, so only round 1 has a rule.
  await db.schema.alterTable("round").addColumn("proposal_rule", "text").execute();
  await db.schema
    .alterTable("round")
    .addCheckConstraint(
      "round_proposal_rule_check",
      sql`proposal_rule is null or (number = 1 and length(btrim(proposal_rule)) > 0 and length(proposal_rule) <= ${sql.lit(PROPOSAL_RULE_MAX)})`,
    )
    .execute();
  // NOTE: DE2. The rule is part of what participants see before they rate, so it stays fixed.
  await sql.raw(lockFunction(true)).execute(db);

  await db.schema
    .createTable("round_proposal")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("round_id", "uuid", (col) =>
      col.notNull().references("round.id").onDelete("cascade"),
    )
    // NOTE: ADR 0005. Only rater-link.ts resolves the code to a person.
    .addColumn("rating_code_id", "uuid", (col) =>
      col.notNull().references("rating_code.id").onDelete("restrict"),
    )
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text", (col) => col.notNull().defaultTo(""))
    // The board element the facilitator made from it; null until then.
    .addColumn("element_id", "uuid", (col) => col.references("element.id").onDelete("set null"))
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "round_proposal_name_check",
      sql`length(btrim(name)) > 0 and length(name) <= ${sql.lit(PROPOSAL_NAME_MAX)}`,
    )
    .addCheckConstraint(
      "round_proposal_description_check",
      sql`length(description) <= ${sql.lit(PROPOSAL_DESCRIPTION_MAX)}`,
    )
    .execute();
  await db.schema
    .createIndex("round_proposal_round_id_idx")
    .on("round_proposal")
    .columns(["round_id", "rating_code_id"])
    .execute();

  // NOTE: DE16, Q-AUDIT-1. A proposal is accepted only in round 1 while it is open, from a
  // rating code of the round's project, against the database clock as for a rating.
  await sql`
    create function round_proposal_in_open_first_round() returns trigger language plpgsql as $$
    declare r round%rowtype;
    begin
      select * into r from round where id = new.round_id;
      if r.number <> 1 then
        raise exception 'proposal_not_first_round' using errcode = 'check_violation';
      end if;
      if r.opened_at is null or r.closed_at is not null or now() > r.closes_at then
        raise exception 'proposal_round_not_open' using errcode = 'check_violation';
      end if;
      if not exists (
        select 1 from rating_code c where c.id = new.rating_code_id and c.project_id = r.project_id
      ) then
        raise exception 'proposal_code_wrong_project' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);
  await sql`
    create trigger round_proposal_in_open_first_round before insert on round_proposal
    for each row execute function round_proposal_in_open_first_round()
  `.execute(db);

  await sourceKinds(db, ELEMENT_SOURCE_KIND_KEYS);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`delete from element_source where kind = 'delphi'`.execute(db);
  await sourceKinds(db, EARLIER_SOURCE_KINDS);
  await db.schema.dropTable("round_proposal").execute();
  await sql`drop function round_proposal_in_open_first_round()`.execute(db);
  await sql.raw(lockFunction(false)).execute(db);
  await db.schema.alterTable("round").dropColumn("proposal_rule").execute();
}
