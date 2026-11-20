// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Source models (EL12, ADR 0016): the archetypes, FHIR profiles, logical models, zibs and other
// sources a project starts its long list from; their imported elements; and one kind of link
// from a candidate element to a source element (EL4). element_ckm_link stays as the board's
// openEHR link; its rows are copied into the new tables here, so the coverage table sees them.
import { type Kysely, sql } from "kysely";

const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));

export const SOURCE_MODEL_KINDS = ["ckm", "fhir", "zib", "other"] as const;
export const SOURCE_MODEL_STATUSES = ["suggested", "added", "imported"] as const;
/** The longest title and link of a source model; src/server/sources/schemas.ts agrees. */
export const SOURCE_TITLE_MAX = 200;
export const SOURCE_LINK_MAX = 2000;
const BINDING_STRENGTHS = ["required", "extensible", "preferred", "example"] as const;

const EARLIER_SOURCE_KINDS = ["brainstorm", "csv", "ckm", "delphi"] as const;
/** The element source kinds after this migration; a test checks them against the board. */
export const ELEMENT_SOURCE_KIND_KEYS = [...EARLIER_SOURCE_KINDS, "fhir", "zib"] as const;

async function sourceKinds(db: Kysely<unknown>, kinds: readonly string[]): Promise<void> {
  await sql`alter table element_source drop constraint element_source_kind_check`.execute(db);
  await sql`alter table element_source add constraint element_source_kind_check check (kind in (${inList(kinds)}))`.execute(
    db,
  );
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("source_model")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("project.id").onDelete("cascade"),
    )
    .addColumn("kind", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("link", "text")
    .addColumn("fhir_package", "text")
    .addColumn("fhir_version", "text")
    .addColumn("fhir_canonical", "text")
    .addColumn("fhir_kind", "text")
    .addColumn("fhir_type", "text")
    .addColumn("ckm_archetype_id", "text")
    .addColumn("ckm_cid", "text")
    .addColumn("ckm_revision", "text")
    .addColumn("zib_name", "text")
    .addColumn("zib_version", "text")
    // Who added or suggested it; never selected in a participant query (EL2, ADR 0005).
    .addColumn("added_by_member_id", "text", (col) =>
      col.references("member.id").onDelete("set null"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addColumn("imported_at", "timestamptz")
    .addCheckConstraint("source_model_kind_check", sql`kind in (${inList(SOURCE_MODEL_KINDS)})`)
    .addCheckConstraint(
      "source_model_status_check",
      sql`status in (${inList(SOURCE_MODEL_STATUSES)})`,
    )
    .addCheckConstraint(
      "source_model_title_check",
      sql`length(btrim(title)) > 0 and length(title) <= ${sql.lit(SOURCE_TITLE_MAX)}`,
    )
    .addCheckConstraint(
      "source_model_link_check",
      sql`link is null or (link ~ '^https?://' and length(link) <= ${sql.lit(SOURCE_LINK_MAX)})`,
    )
    // A FHIR or zib model names its package, version and StructureDefinition; no other does.
    .addCheckConstraint(
      "source_model_fhir_check",
      sql`(kind in ('fhir', 'zib')) = (fhir_package is not null and fhir_version is not null and fhir_canonical is not null)
        and (kind in ('fhir', 'zib') or (fhir_kind is null and fhir_type is null))`,
    )
    .addCheckConstraint(
      "source_model_ckm_check",
      sql`(kind = 'ckm') = (ckm_archetype_id is not null and ckm_cid is not null and ckm_revision is not null)`,
    )
    .addCheckConstraint(
      "source_model_zib_check",
      sql`(kind = 'zib') = (zib_name is not null) and (zib_version is null or kind = 'zib')`,
    )
    // NOTE: EL12. A participant suggests a title and a link; the facilitator adds the model.
    .addCheckConstraint(
      "source_model_suggested_check",
      sql`status <> 'suggested' or kind = 'other'`,
    )
    .addCheckConstraint(
      "source_model_imported_check",
      sql`(status = 'imported') = (imported_at is not null)`,
    )
    .execute();
  await db.schema
    .createIndex("source_model_project_id_idx")
    .on("source_model")
    .column("project_id")
    .execute();
  await sql`
    create unique index source_model_ckm_unique on source_model (project_id, ckm_archetype_id)
    where kind = 'ckm'
  `.execute(db);
  await sql`
    create unique index source_model_fhir_unique on source_model
    (project_id, fhir_package, fhir_version, fhir_canonical) where kind in ('fhir', 'zib')
  `.execute(db);

  await db.schema
    .createTable("source_element")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("source_model_id", "uuid", (col) =>
      col.notNull().references("source_model.id").onDelete("cascade"),
    )
    .addColumn("position", "integer", (col) => col.notNull())
    // The FHIR element id (slice names kept) or the archetype path; the at-code for a CKM link
    // copied below, whose path element_ckm_link never stored.
    .addColumn("path", "text", (col) => col.notNull())
    .addColumn("at_code", "text")
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("definition", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("type", "text")
    .addColumn("min_occurs", "integer")
    // Null with a minimum is unbounded (`*`), as on element.
    .addColumn("max_occurs", "integer")
    .addColumn("code_system", "text")
    .addColumn("code", "text")
    .addColumn("code_display", "text")
    .addColumn("binding_strength", "text")
    .addColumn("binding_value_set", "text")
    .addColumn("nl_cm_id", "text")
    .addUniqueConstraint("source_element_path_unique", ["source_model_id", "path"])
    .addCheckConstraint(
      "source_element_cardinality_check",
      sql`(min_occurs is null and max_occurs is null) or (min_occurs >= 0 and (max_occurs is null or max_occurs >= min_occurs))`,
    )
    .addCheckConstraint(
      "source_element_code_check",
      sql`(code_system is null) = (code is null) and (code_display is null or code is not null)`,
    )
    .addCheckConstraint(
      "source_element_binding_check",
      sql`(binding_strength is null or binding_strength in (${inList(BINDING_STRENGTHS)})) and (binding_value_set is null or binding_strength is not null)`,
    )
    .execute();

  await db.schema
    .createTable("element_source_link")
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    .addColumn("source_element_id", "uuid", (col) =>
      col.notNull().references("source_element.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("element_source_link_pkey", ["element_id", "source_element_id"])
    .execute();
  await db.schema
    .createIndex("element_source_link_source_element_id_idx")
    .on("element_source_link")
    .column("source_element_id")
    .execute();

  await sourceKinds(db, ELEMENT_SOURCE_KIND_KEYS);

  // NOTE: our own design. One source model per project and archetype, at the revision of its
  // latest link; `imported` when the archetype was imported (EL7), else `added`. Each linked
  // at-code becomes a source element, and each CKM link an element_source_link.
  await sql`
    insert into source_model
      (project_id, kind, status, title, ckm_archetype_id, ckm_cid, ckm_revision, created_at, imported_at)
    select distinct on (element.project_id, link.archetype_id)
      element.project_id, 'ckm',
      case when imported.label is null then 'added' else 'imported' end,
      link.archetype_id, link.archetype_id, link.cid, link.revision, link.linked_at,
      case when imported.label is null then null else link.linked_at end
    from element_ckm_link link
    join element on element.id = link.element_id
    left join lateral (
      select source.label from element_source source
      join element other on other.id = source.element_id
      where other.project_id = element.project_id and source.kind = 'ckm'
        and source.label = link.archetype_id
      limit 1
    ) imported on true
    order by element.project_id, link.archetype_id, link.linked_at desc
  `.execute(db);
  await sql`
    insert into source_element (source_model_id, position, path, at_code, name, type)
    select model.id,
      row_number() over (partition by model.id order by min(link.at_code)) - 1,
      link.at_code, link.at_code, min(link.ckm_element_name), min(link.rm_type)
    from element_ckm_link link
    join element on element.id = link.element_id
    join source_model model on model.kind = 'ckm' and model.project_id = element.project_id
      and model.ckm_archetype_id = link.archetype_id
    group by model.id, link.at_code
  `.execute(db);
  await sql`
    insert into element_source_link (element_id, source_element_id, created_at)
    select link.element_id, source.id, link.linked_at
    from element_ckm_link link
    join element on element.id = link.element_id
    join source_model model on model.kind = 'ckm' and model.project_id = element.project_id
      and model.ckm_archetype_id = link.archetype_id
    join source_element source on source.source_model_id = model.id
      and source.at_code = link.at_code
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`delete from element_source where kind in ('fhir', 'zib')`.execute(db);
  await sourceKinds(db, EARLIER_SOURCE_KINDS);
  await db.schema.dropTable("element_source_link").execute();
  await db.schema.dropTable("source_element").execute();
  await db.schema.dropTable("source_model").execute();
}
