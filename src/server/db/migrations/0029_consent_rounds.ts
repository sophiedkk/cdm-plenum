// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Consent rounds of a Team project (DE20, ADR 0023): each member answers Include, Leave out,
// Discuss or "Unable to judge" per element, by name. The answers live in a table of their own, so
// a rating (anonymous, ADR 0005) never changes. The facilitator settles an element that ended on
// "To discuss" with a note, which the outcome of `round_element` takes over.
import { type Kysely, sql } from "kysely";

/** The consent answers; src/lib/consent.ts agrees. */
export const CONSENT_ANSWER_KEYS = ["include", "leave_out", "discuss", "abstain"] as const;
/** The longest reason and settle note; src/lib/consent.ts agrees. */
export const CONSENT_TEXT_MAX = 2000;

const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));
const textCheck = (column: string) =>
  sql`length(btrim(${sql.ref(column)})) > 0 and length(${sql.ref(column)}) <= ${sql.lit(CONSENT_TEXT_MAX)}`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("consent_answer")
    .addColumn("round_id", "uuid", (col) => col.notNull())
    .addColumn("element_id", "uuid", (col) => col.notNull())
    // Named by design in a Team project (ADR 0023): the member id, not a rating code.
    .addColumn("member_id", "text", (col) =>
      col.notNull().references("member.id").onDelete("cascade"),
    )
    .addColumn("team_id", "text", (col) => col.references("team.id").onDelete("set null"))
    .addColumn("answer", "text", (col) => col.notNull())
    .addColumn("reason", "text")
    .addColumn("updated_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("consent_answer_pk", ["round_id", "element_id", "member_id"])
    .addForeignKeyConstraint(
      "consent_answer_round_element_fk",
      ["round_id", "element_id"],
      "round_element",
      ["round_id", "element_id"],
      (cb) => cb.onDelete("cascade"),
    )
    .addCheckConstraint(
      "consent_answer_answer_check",
      sql`answer in (${inList(CONSENT_ANSWER_KEYS)})`,
    )
    // NOTE: DE20, owner decision 2026-11-25. A reason is required for Leave out and Discuss,
    // optional for Include, and "Unable to judge" has none.
    .addCheckConstraint(
      "consent_answer_reason_check",
      sql`(answer = 'include' and (reason is null or (${textCheck("reason")})))
        or (answer = 'abstain' and reason is null)
        or (answer in ('leave_out', 'discuss') and reason is not null and ${textCheck("reason")})`,
    )
    .execute();
  await db.schema
    .createIndex("consent_answer_member_id_idx")
    .on("consent_answer")
    .column("member_id")
    .execute();

  // An answer is accepted only while its round is open, in a Team project, from a member of the
  // round's project; the database clock decides, as for a rating.
  await sql`
    create function consent_answer_in_open_round() returns trigger language plpgsql as $$
    declare r round%rowtype;
    begin
      select * into r from round where id = new.round_id;
      if r.opened_at is null or r.closed_at is not null or now() > r.closes_at then
        raise exception 'consent_round_not_open' using errcode = 'check_violation';
      end if;
      if not exists (select 1 from project p where p.id = r.project_id and p.mode = 'team') then
        raise exception 'consent_project_not_team' using errcode = 'check_violation';
      end if;
      if not exists (
        select 1 from member m where m.id = new.member_id and m."organizationId" = r.project_id
      ) then
        raise exception 'consent_member_wrong_project' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);
  await sql`
    create trigger consent_answer_in_open_round before insert or update on consent_answer
    for each row execute function consent_answer_in_open_round()
  `.execute(db);

  // A Team project has no scores: its rounds decide by consent.
  await sql`
    create function rating_delphi_only() returns trigger language plpgsql as $$
    begin
      if exists (
        select 1 from round r join project p on p.id = r.project_id
        where r.id = new.round_id and p.mode = 'team'
      ) then
        raise exception 'rating_project_team' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `.execute(db);
  await sql`
    create trigger rating_delphi_only before insert or update on rating
    for each row execute function rating_delphi_only()
  `.execute(db);

  // The facilitator's note on an element settled from "To discuss" (DE20). Settling moves the
  // outcome from no_consensus to included or excluded; both columns are set together or not.
  await db.schema.alterTable("round_element").addColumn("settled_at", "timestamptz").execute();
  await db.schema.alterTable("round_element").addColumn("settled_note", "text").execute();
  await db.schema
    .alterTable("round_element")
    .addCheckConstraint(
      "round_element_settled_check",
      sql`(settled_at is null and settled_note is null)
        or (settled_at is not null and outcome in ('included', 'excluded') and settled_note is not null and ${textCheck("settled_note")})`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("round_element").dropColumn("settled_note").execute();
  await db.schema.alterTable("round_element").dropColumn("settled_at").execute();
  await sql`drop trigger rating_delphi_only on rating`.execute(db);
  await sql`drop function rating_delphi_only()`.execute(db);
  await sql`drop trigger consent_answer_in_open_round on consent_answer`.execute(db);
  await sql`drop function consent_answer_in_open_round()`.execute(db);
  await db.schema.dropTable("consent_answer").execute();
}
