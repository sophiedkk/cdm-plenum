// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The order of the elements within a group of the model tree (DT6, issue #99). The openEHR RM
// defines CLUSTER.items as an ordered list, so a tree that loses the order loses the hand-off.
// A tree proposal stores the order per group; settling copies it onto the element.
import { type Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("tree_proposal_element").addColumn("position", "integer").execute();
  await sql`
    update tree_proposal_element as target set position = ranked.position
    from (
      select row.proposal_id, row.element_id,
        (row_number() over (
          partition by row.proposal_id, row.group_id order by element.created_at, element.id
        ) - 1)::integer as position
      from tree_proposal_element as row
      join element on element.id = row.element_id
    ) as ranked
    where target.proposal_id = ranked.proposal_id and target.element_id = ranked.element_id
  `.execute(db);
  await sql`alter table tree_proposal_element alter column position set not null`.execute(db);
  await db.schema
    .alterTable("tree_proposal_element")
    .addCheckConstraint("tree_proposal_element_position_check", sql`position >= 0`)
    .execute();

  await db.schema.alterTable("element").addColumn("tree_position", "integer").execute();
  await db.schema
    .alterTable("element")
    .addCheckConstraint(
      "element_tree_position_check",
      sql`tree_position is null or tree_position >= 0`,
    )
    .execute();
  await sql`
    update element set tree_position = row.position
    from tree_proposal_element as row
    join detail_proposal on detail_proposal.id = row.proposal_id
    where row.element_id = element.id and detail_proposal.settled_at is not null
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.alterTable("element").dropColumn("tree_position").execute();
  await db.schema.alterTable("tree_proposal_element").dropColumn("position").execute();
}
