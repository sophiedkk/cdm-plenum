// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The detail phase (PR4, DT1, DT2, ADR 0017): a fifth phase between decide and hand-off, the
// structure proposal of an element in the model, its values, and the members' consent answers.
// An answer carries the member id, as a first-look answer does (EL22): no participant query
// selects it (EL2), and the facilitator reads objections without names.
import { type Kysely, sql } from "kysely";
import { DATA_TYPE_KEYS } from "./0002_projects.ts";

// NOTE: written out, so this migration never changes when src/lib/project-phases.ts does.
const PHASES = ["scope", "discover", "decide", "detail", "handoff"] as const;
const PHASES_BEFORE = ["scope", "discover", "decide", "handoff"] as const;
/** The consent answers (DT2); src/lib/details.ts agrees. */
export const DETAIL_ANSWER_KEYS = ["agree", "objection"] as const;
/** The longest objection reason and addressed note; src/lib/details.ts agrees. */
export const DETAIL_TEXT_MAX = 2000;
/** The proposer's expert type (DT1): null when the facilitator proposed. */
const PROPOSER_EXPERT_TYPES = ["architecture"] as const;

const now = sql`now()`;
const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));
const textCheck = (column: string) =>
  sql`length(btrim(${sql.ref(column)})) > 0 and length(${sql.ref(column)}) <= ${sql.lit(DETAIL_TEXT_MAX)}`;

async function phaseCheck(db: Kysely<unknown>, phases: readonly string[]): Promise<void> {
  await sql`alter table project drop constraint project_phase_check`.execute(db);
  await sql`alter table project add constraint project_phase_check check (phase in (${inList(phases)}))`.execute(
    db,
  );
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await phaseCheck(db, PHASES);

  await db.schema
    .createTable("detail_proposal")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    // One proposal per element (DT1); a revision raises the version of this row.
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().unique().references("element.id").onDelete("cascade"),
    )
    .addColumn("version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("data_type", "text")
    .addColumn("min_occurs", "smallint")
    .addColumn("max_occurs", "integer")
    // Read for the facilitator only; participants see the expert type (DT1).
    .addColumn("proposer_member_id", "text", (col) =>
      col.references("member.id").onDelete("set null"),
    )
    .addColumn("proposer_expert_type", "text")
    .addColumn("proposed_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addColumn("settled_at", "timestamptz")
    .addCheckConstraint("detail_proposal_version_check", sql`version >= 1`)
    .addCheckConstraint(
      "detail_proposal_data_type_check",
      sql`data_type is null or data_type in (${inList(DATA_TYPE_KEYS)})`,
    )
    .addCheckConstraint(
      "detail_proposal_cardinality_check",
      sql`(min_occurs is null and max_occurs is null) or (min_occurs in (0, 1) and (max_occurs is null or (max_occurs >= 1 and max_occurs >= min_occurs)))`,
    )
    .addCheckConstraint(
      "detail_proposal_expert_type_check",
      sql`proposer_expert_type is null or proposer_expert_type in (${inList(PROPOSER_EXPERT_TYPES)})`,
    )
    .execute();

  await db.schema
    .createTable("detail_proposal_value")
    .addColumn("proposal_id", "uuid", (col) =>
      col.notNull().references("detail_proposal.id").onDelete("cascade"),
    )
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("text", "text", (col) => col.notNull())
    .addColumn("value", "numeric")
    .addPrimaryKeyConstraint("detail_proposal_value_pkey", ["proposal_id", "position"])
    .addCheckConstraint("detail_proposal_value_text_check", sql`length(btrim(text)) > 0`)
    .execute();

  await db.schema
    .createTable("detail_answer")
    // Random, so the facilitator addresses an objection by an id that names nobody.
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("proposal_id", "uuid", (col) =>
      col.notNull().references("detail_proposal.id").onDelete("cascade"),
    )
    // The version answered; answers to an earlier version are the history (owner decision
    // 2026-11-23: a revision asks everyone again).
    .addColumn("version", "integer", (col) => col.notNull())
    // Never selected in a participant query, nor with an objection for the facilitator (EL2).
    .addColumn("member_id", "text", (col) =>
      col.notNull().references("member.id").onDelete("cascade"),
    )
    .addColumn("answer", "text", (col) => col.notNull())
    .addColumn("reason", "text")
    .addColumn("addressed_at", "timestamptz")
    .addColumn("addressed_note", "text")
    .addColumn("answered_at", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addUniqueConstraint("detail_answer_unique", ["proposal_id", "version", "member_id"])
    .addCheckConstraint(
      "detail_answer_answer_check",
      sql`answer in (${inList(DETAIL_ANSWER_KEYS)})`,
    )
    .addCheckConstraint(
      "detail_answer_reason_check",
      sql`(answer = 'agree' and reason is null) or (answer = 'objection' and reason is not null and ${textCheck("reason")})`,
    )
    .addCheckConstraint(
      "detail_answer_addressed_check",
      sql`(addressed_at is null and addressed_note is null) or (answer = 'objection' and addressed_at is not null and addressed_note is not null and ${textCheck("addressed_note")})`,
    )
    .execute();
  await db.schema
    .createIndex("detail_answer_member_id_idx")
    .on("detail_answer")
    .column("member_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("detail_answer").execute();
  await db.schema.dropTable("detail_proposal_value").execute();
  await db.schema.dropTable("detail_proposal").execute();
  // NOTE: no spec governs this, our own design: decide is the phase before detail, and the
  // details settled so far stay on the elements.
  await sql`update project set phase = 'decide' where phase = 'detail'`.execute(db);
  await phaseCheck(db, PHASES_BEFORE);
}
