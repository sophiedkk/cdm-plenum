// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The reference element (EL26, ADR 0021): an element of kind `reference` names another whole
// model by title and an optional link, and carries a cardinality but no data type, codes or
// values. The checks hold the element's own columns; the triggers hold its values and its
// detail proposals, which live in other tables.
import { type Kysely, sql } from "kysely";

/** The kinds of an element; src/lib/elements.ts agrees. */
export const ELEMENT_KINDS = ["data", "reference"] as const;
/** The longest model title and link; src/lib/elements.ts agrees. */
export const REFERENCE_TITLE_MAX = 300;
export const REFERENCE_URL_MAX = 2000;

const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));

const CHECKS: [string, ReturnType<typeof sql>][] = [
  ["element_kind_check", sql`kind in (${inList(ELEMENT_KINDS)})`],
  [
    "element_reference_check",
    sql`(kind = 'data' and reference_title is null and reference_url is null) or (kind = 'reference' and reference_title is not null and length(btrim(reference_title)) > 0 and length(reference_title) <= ${sql.lit(REFERENCE_TITLE_MAX)} and (reference_url is null or (reference_url ~ '^https?://' and length(reference_url) <= ${sql.lit(REFERENCE_URL_MAX)})))`,
  ],
  // NOTE: Architectuur zibs 2.0, P3.2. A reference points to a whole model, so it has no data
  // type, codes or binding of its own; only its cardinality says how often it occurs.
  [
    "element_reference_fields_check",
    sql`kind = 'data' or (data_type is null and code_system is null and code is null and code_display is null and binding_strength is null and value_set_url is null)`,
  ],
];

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("element")
    .addColumn("kind", "text", (col) => col.notNull().defaultTo("data"))
    .addColumn("reference_title", "text")
    .addColumn("reference_url", "text")
    .execute();
  for (const [name, check] of CHECKS) {
    await db.schema.alterTable("element").addCheckConstraint(name, check).execute();
  }

  await sql`
    create function element_reference_guard() returns trigger language plpgsql as $$
    begin
      if tg_table_name = 'element' then
        if new.kind = 'reference' and (
          exists (select 1 from element_value where element_id = new.id)
          or exists (select 1 from detail_proposal where element_id = new.id
                     and (kind = 'terminology' or data_type is not null))
        ) then
          raise exception 'reference_has_details';
        end if;
      elsif tg_table_name = 'element_value' then
        if exists (select 1 from element where id = new.element_id and kind = 'reference') then
          raise exception 'reference_values';
        end if;
      elsif tg_table_name = 'detail_proposal' then
        if (new.kind = 'terminology' or new.data_type is not null)
          and exists (select 1 from element where id = new.element_id and kind = 'reference') then
          raise exception 'reference_details';
        end if;
      elsif tg_table_name = 'detail_proposal_value' then
        if exists (select 1 from detail_proposal
                   join element on element.id = detail_proposal.element_id
                   where detail_proposal.id = new.proposal_id and element.kind = 'reference') then
          raise exception 'reference_values';
        end if;
      end if;
      return new;
    end $$
  `.execute(db);
  await sql`
    create trigger element_reference_guard before update of kind on element
    for each row execute function element_reference_guard()
  `.execute(db);
  for (const table of ["element_value", "detail_proposal", "detail_proposal_value"]) {
    await sql`
      create trigger element_reference_guard before insert or update on ${sql.table(table)}
      for each row execute function element_reference_guard()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of ["element", "element_value", "detail_proposal", "detail_proposal_value"]) {
    await sql`drop trigger element_reference_guard on ${sql.table(table)}`.execute(db);
  }
  await sql`drop function element_reference_guard()`.execute(db);
  // NOTE: no spec governs this, our own design: before EL26 every element is a data element, so
  // a reference keeps its name and cardinality and loses only its target.
  await db.schema
    .alterTable("element")
    .dropColumn("kind")
    .dropColumn("reference_title")
    .dropColumn("reference_url")
    .execute();
}
