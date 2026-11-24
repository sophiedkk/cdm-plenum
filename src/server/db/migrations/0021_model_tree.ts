// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The tree of the model (DT6, ADR 0021): groups nest, each with a cardinality, a group can be a
// sub-block, and an element can be a registration element (Architectuur zibs 2.0, P2.6, P3.3).
// The architect's or facilitator's proposal is a detail proposal of kind `tree` for the whole
// project, so it shares the versions, consent answers and settling of DT2. Settling copies the
// tree onto `element_group` and `element`, which every other screen and export reads.
import { type Kysely, sql } from "kysely";
import { ELEMENT_GROUP_NAME_MAX } from "./0014_element_groups.ts";

/** The kinds of a detail proposal; src/lib/details.ts agrees. */
export const DETAIL_KINDS = ["structure", "terminology", "tree"] as const;
/** The longest sub-block title and link; src/lib/model-tree.ts agrees. */
export const SUB_BLOCK_TITLE_MAX = 300;
export const SUB_BLOCK_URL_MAX = 2000;

const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));

const cardinalityCheck = sql`(min_occurs is null and max_occurs is null) or (min_occurs in (0, 1) and (max_occurs is null or (max_occurs >= 1 and max_occurs >= min_occurs)))`;
const subBlockCheck = sql`(not sub_block and sub_block_title is null and sub_block_url is null) or (sub_block and (sub_block_title is null or (length(btrim(sub_block_title)) > 0 and length(sub_block_title) <= ${sql.lit(SUB_BLOCK_TITLE_MAX)})) and (sub_block_url is null or (sub_block_title is not null and sub_block_url ~ '^https?://' and length(sub_block_url) <= ${sql.lit(SUB_BLOCK_URL_MAX)})))`;

async function addGroupShape(db: Kysely<unknown>, table: string): Promise<void> {
  await db.schema
    .alterTable(table)
    .addColumn("min_occurs", "smallint")
    .addColumn("max_occurs", "integer")
    .addColumn("sub_block", "boolean", (col) => col.notNull().defaultTo(false))
    .addColumn("sub_block_title", "text")
    .addColumn("sub_block_url", "text")
    .execute();
  await db.schema
    .alterTable(table)
    .addCheckConstraint(`${table}_cardinality_check`, cardinalityCheck)
    .execute();
  await db.schema
    .alterTable(table)
    .addCheckConstraint(`${table}_sub_block_check`, subBlockCheck)
    .execute();
}

/** The checks of 0017 that name the kinds, as they were before this migration. */
const CHECKS_BEFORE: [string, ReturnType<typeof sql>][] = [
  ["detail_proposal_kind_check", sql`kind in ('structure', 'terminology')`],
  [
    "detail_proposal_expert_type_check",
    sql`proposer_expert_type is null or proposer_expert_type = case kind when 'structure' then 'architecture' else 'terminology' end`,
  ],
  [
    "detail_proposal_review_check",
    sql`(kind = 'structure' and review_state is null) or (kind = 'terminology' and review_state in ('pending', 'approved', 'returned', 'skipped'))`,
  ],
];

const CHECKS_AFTER: [string, ReturnType<typeof sql>][] = [
  ["detail_proposal_kind_check", sql`kind in (${inList(DETAIL_KINDS)})`],
  // NOTE: DT6. The tree is part of the structure step, so an architect proposes it.
  [
    "detail_proposal_expert_type_check",
    sql`proposer_expert_type is null or proposer_expert_type = case kind when 'terminology' then 'terminology' else 'architecture' end`,
  ],
  [
    "detail_proposal_review_check",
    sql`(kind in ('structure', 'tree') and review_state is null) or (kind = 'terminology' and review_state in ('pending', 'approved', 'returned', 'skipped'))`,
  ],
  // A tree belongs to the project; every other kind to one element.
  [
    "detail_proposal_owner_check",
    sql`(kind = 'tree' and element_id is null and project_id is not null) or (kind <> 'tree' and element_id is not null and project_id is null)`,
  ],
];

async function replaceChecks(
  db: Kysely<unknown>,
  checks: [string, ReturnType<typeof sql>][],
  drop: readonly string[],
): Promise<void> {
  for (const name of drop) {
    await sql`alter table detail_proposal drop constraint ${sql.raw(name)}`.execute(db);
  }
  for (const [name, check] of checks) {
    await db.schema.alterTable("detail_proposal").addCheckConstraint(name, check).execute();
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("element_group")
    .addColumn("parent_id", "uuid", (col) =>
      col.references("element_group.id").onDelete("set null"),
    )
    .execute();
  await addGroupShape(db, "element_group");
  await db.schema
    .createIndex("element_group_parent_id_idx")
    .on("element_group")
    .column("parent_id")
    .execute();
  // NOTE: no spec governs this, our own design: the database refuses a parent in another project
  // and a loop, so no write path can turn the tree into something else.
  await sql`
    create function element_group_tree_guard() returns trigger language plpgsql as $$
    begin
      if new.parent_id is null then
        return new;
      end if;
      if not exists (select 1 from element_group
                     where id = new.parent_id and project_id = new.project_id) then
        raise exception 'group_parent_elsewhere';
      end if;
      if exists (
        with recursive up(id) as (
          select new.parent_id
          union
          select element_group.parent_id from element_group
          join up on element_group.id = up.id
          where element_group.parent_id is not null
        )
        select 1 from up where id = new.id
      ) then
        raise exception 'group_cycle';
      end if;
      return new;
    end $$
  `.execute(db);
  await sql`
    create trigger element_group_tree_guard before insert or update of parent_id on element_group
    for each row execute function element_group_tree_guard()
  `.execute(db);

  await db.schema
    .alterTable("element")
    .addColumn("registration", "boolean", (col) => col.notNull().defaultTo(false))
    .execute();

  await db.schema
    .alterTable("detail_proposal")
    .addColumn("project_id", "text", (col) => col.references("project.id").onDelete("cascade"))
    .execute();
  await sql`alter table detail_proposal alter column element_id drop not null`.execute(db);
  await replaceChecks(
    db,
    CHECKS_AFTER,
    CHECKS_BEFORE.map(([name]) => name),
  );
  await sql`
    create unique index detail_proposal_tree_unique on detail_proposal (project_id)
    where kind = 'tree'
  `.execute(db);

  // The proposed groups. `group_id` is the group's id, or for a group the proposal adds, the id
  // it gets when settled; so it has no foreign key. `name` is set for an added group only.
  await db.schema
    .createTable("tree_proposal_group")
    .addColumn("proposal_id", "uuid", (col) =>
      col.notNull().references("detail_proposal.id").onDelete("cascade"),
    )
    .addColumn("group_id", "uuid", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("parent_id", "uuid")
    .addColumn("position", "integer", (col) => col.notNull())
    .addPrimaryKeyConstraint("tree_proposal_group_pkey", ["proposal_id", "group_id"])
    .addCheckConstraint(
      "tree_proposal_group_name_check",
      sql`name is null or (length(btrim(name)) > 0 and length(name) <= ${sql.lit(ELEMENT_GROUP_NAME_MAX)})`,
    )
    .execute();
  await addGroupShape(db, "tree_proposal_group");

  await db.schema
    .createTable("tree_proposal_element")
    .addColumn("proposal_id", "uuid", (col) =>
      col.notNull().references("detail_proposal.id").onDelete("cascade"),
    )
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    .addColumn("group_id", "uuid")
    .addColumn("registration", "boolean", (col) => col.notNull())
    .addPrimaryKeyConstraint("tree_proposal_element_pkey", ["proposal_id", "element_id"])
    .execute();
  await db.schema
    .createIndex("tree_proposal_element_element_id_idx")
    .on("tree_proposal_element")
    .column("element_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("tree_proposal_element").execute();
  await db.schema.dropTable("tree_proposal_group").execute();
  await sql`delete from detail_proposal where kind = 'tree'`.execute(db);
  await sql`drop index detail_proposal_tree_unique`.execute(db);
  await replaceChecks(db, CHECKS_BEFORE, [...CHECKS_AFTER.map(([name]) => name)]);
  await sql`alter table detail_proposal alter column element_id set not null`.execute(db);
  await db.schema.alterTable("detail_proposal").dropColumn("project_id").execute();

  await db.schema.alterTable("element").dropColumn("registration").execute();

  await sql`drop trigger element_group_tree_guard on element_group`.execute(db);
  await sql`drop function element_group_tree_guard()`.execute(db);
  // NOTE: no spec governs this, our own design: before DT6 the groups are flat, so a nested group
  // keeps its elements and becomes a top-level group.
  await db.schema
    .alterTable("element_group")
    .dropColumn("parent_id")
    .dropColumn("min_occurs")
    .dropColumn("max_occurs")
    .dropColumn("sub_block")
    .dropColumn("sub_block_title")
    .dropColumn("sub_block_url")
    .execute();
}
