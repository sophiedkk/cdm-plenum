// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The terminology step of the detail phase (DT4, DT5, ADR 0017): a proposal gets a kind, so a
// code proposal shares the versions, answers and settling of a structure proposal (owner
// decision 2026-11-23). A code proposal carries the element code, the binding and a code per
// value, and a review by a second terminologist gates it. Settling copies the codes onto the
// element and its values, as settling a structure does.
import { type Kysely, sql } from "kysely";

/** The kinds of a detail proposal; src/lib/details.ts agrees. */
export const DETAIL_KINDS = ["structure", "terminology"] as const;
/** FHIR R4 binding strengths, shared by zibs and ADL2 (DT5); src/lib/details.ts agrees. */
export const BINDING_STRENGTHS = ["required", "extensible", "preferred", "example"] as const;
/** Where the review of a code proposal stands (DT4); src/lib/details.ts agrees. */
export const REVIEW_STATES = ["pending", "approved", "returned", "skipped"] as const;

const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));

/** A code is a system and a code together, with an optional display; or nothing at all. */
const codeCheck = (prefix = "") => {
  const [system, code, display] = ["code_system", "code", "code_display"].map((column) =>
    sql.ref(`${prefix}${column}`),
  );
  return sql`(${system} is null and ${code} is null and ${display} is null) or (${system} is not null and ${code} is not null)`;
};

async function addCodeColumns(db: Kysely<unknown>, table: string): Promise<void> {
  await db.schema
    .alterTable(table)
    .addColumn("code_system", "text")
    .addColumn("code", "text")
    .addColumn("code_display", "text")
    .execute();
  await db.schema
    .alterTable(table)
    .addCheckConstraint(`${table}_code_check`, codeCheck())
    .execute();
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("detail_proposal")
    .addColumn("kind", "text", (col) => col.notNull().defaultTo("structure"))
    .addColumn("binding_strength", "text")
    .addColumn("value_set_url", "text")
    .addColumn("review_state", "text")
    // Read for the facilitator only, as the proposer is (DT4).
    .addColumn("reviewer_member_id", "text", (col) =>
      col.references("member.id").onDelete("set null"),
    )
    .addColumn("review_note", "text")
    .addColumn("reviewed_at", "timestamptz")
    .execute();
  await addCodeColumns(db, "detail_proposal");
  await sql`alter table detail_proposal drop constraint detail_proposal_element_id_key`.execute(db);
  await sql`alter table detail_proposal drop constraint detail_proposal_expert_type_check`.execute(
    db,
  );
  await db.schema
    .alterTable("detail_proposal")
    .addUniqueConstraint("detail_proposal_element_kind_unique", ["element_id", "kind"])
    .execute();
  const checks: [string, ReturnType<typeof sql>][] = [
    ["detail_proposal_kind_check", sql`kind in (${inList(DETAIL_KINDS)})`],
    [
      "detail_proposal_expert_type_check",
      sql`proposer_expert_type is null or proposer_expert_type = case kind when 'structure' then 'architecture' else 'terminology' end`,
    ],
    [
      "detail_proposal_binding_check",
      sql`binding_strength is null or binding_strength in (${inList(BINDING_STRENGTHS)})`,
    ],
    [
      "detail_proposal_review_check",
      sql`(kind = 'structure' and review_state is null) or (kind = 'terminology' and review_state in (${inList(REVIEW_STATES)}))`,
    ],
    [
      "detail_proposal_structure_fields_check",
      sql`kind = 'terminology' or (code is null and binding_strength is null and value_set_url is null and reviewer_member_id is null and review_note is null and reviewed_at is null)`,
    ],
    [
      "detail_proposal_terminology_fields_check",
      sql`kind = 'structure' or (data_type is null and min_occurs is null and max_occurs is null)`,
    ],
  ];
  for (const [name, check] of checks) {
    await db.schema.alterTable("detail_proposal").addCheckConstraint(name, check).execute();
  }

  await addCodeColumns(db, "detail_proposal_value");
  await addCodeColumns(db, "element_value");
  await addCodeColumns(db, "element");
  await db.schema
    .alterTable("element")
    .addColumn("binding_strength", "text")
    .addColumn("value_set_url", "text")
    .execute();
  await db.schema
    .alterTable("element")
    .addCheckConstraint(
      "element_binding_check",
      sql`binding_strength is null or binding_strength in (${inList(BINDING_STRENGTHS)})`,
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("element")
    .dropColumn("binding_strength")
    .dropColumn("value_set_url")
    .dropColumn("code_system")
    .dropColumn("code")
    .dropColumn("code_display")
    .execute();
  for (const table of ["element_value", "detail_proposal_value"]) {
    await db.schema
      .alterTable(table)
      .dropColumn("code_system")
      .dropColumn("code")
      .dropColumn("code_display")
      .execute();
  }
  await sql`delete from detail_proposal where kind = 'terminology'`.execute(db);
  for (const name of [
    "detail_proposal_kind_check",
    "detail_proposal_expert_type_check",
    "detail_proposal_binding_check",
    "detail_proposal_review_check",
    "detail_proposal_structure_fields_check",
    "detail_proposal_terminology_fields_check",
    "detail_proposal_element_kind_unique",
  ]) {
    await sql`alter table detail_proposal drop constraint ${sql.raw(name)}`.execute(db);
  }
  await db.schema
    .alterTable("detail_proposal")
    .dropColumn("kind")
    .dropColumn("binding_strength")
    .dropColumn("value_set_url")
    .dropColumn("review_state")
    .dropColumn("reviewer_member_id")
    .dropColumn("review_note")
    .dropColumn("reviewed_at")
    .dropColumn("code_system")
    .dropColumn("code")
    .dropColumn("code_display")
    .execute();
  await db.schema
    .alterTable("detail_proposal")
    .addUniqueConstraint("detail_proposal_element_id_key", ["element_id"])
    .execute();
  await db.schema
    .alterTable("detail_proposal")
    .addCheckConstraint(
      "detail_proposal_expert_type_check",
      sql`proposer_expert_type is null or proposer_expert_type in ('architecture')`,
    )
    .execute();
}
