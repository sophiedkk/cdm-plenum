// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Checking and settling a tree proposal (DT6). Both the proposal (tree.ts) and the facilitator's
// settling (settleDetail in queries.ts) check the tree against the groups the project has now,
// so a group added or moved in between cannot close a loop.
import type { Kysely, Transaction } from "kysely";
import { hasCycle } from "@/lib/model-tree";
import type { DB } from "../db/schema.gen.ts";

type Db = Kysely<DB> | Transaction<DB>;

export type TreeProblem = "tree_group_not_found" | "tree_group_name_required" | "tree_cycle";

/** A group as a tree proposal places it. */
export interface ProposedGroup {
  id: string;
  /** The name of a group the proposal adds; null for a group the project has. */
  name: string | null;
  parentId: string | null;
}

/** The project's groups with their parents, by id. */
export async function projectGroupParents(
  db: Db,
  projectId: string,
): Promise<Map<string, string | null>> {
  const rows = await db
    .selectFrom("element_group")
    .select(["id", "parent_id"])
    .where("project_id", "=", projectId)
    .execute();
  return new Map(rows.map((row) => [row.id, row.parent_id]));
}

/**
 * The first problem of the proposed groups against the project's groups: a group or parent that
 * is neither in the project nor added by the proposal, an added group without a name, or a
 * loop. Groups the proposal leaves out keep their parent.
 */
export async function treeProblem(
  db: Db,
  projectId: string,
  groups: readonly ProposedGroup[],
): Promise<TreeProblem | null> {
  const existing = await projectGroupParents(db, projectId);
  const added = groups.filter((group) => !existing.has(group.id));
  if (added.length > 0) {
    const elsewhere = await db
      .selectFrom("element_group")
      .select("id")
      .where(
        "id",
        "in",
        added.map((group) => group.id),
      )
      .executeTakeFirst();
    if (elsewhere) return "tree_group_not_found";
  }
  if (added.some((group) => group.name === null)) return "tree_group_name_required";
  const parents = new Map(existing);
  for (const group of groups) parents.set(group.id, group.parentId);
  for (const parent of parents.values()) {
    if (parent !== null && !parents.has(parent)) return "tree_group_not_found";
  }
  return hasCycle(parents) ? "tree_cycle" : null;
}

/**
 * Copies a settled tree proposal onto the project's groups and elements (DT6, owner decision
 * 2026-11-23: settling puts the result where the board, the rounds and the exports read it).
 * Adds the groups the proposal adds, under the id the proposal gave them. Refused with
 * `tree_cycle` when the groups changed since the proposal in a way that closes a loop.
 */
export async function settleTree(
  trx: Transaction<DB>,
  projectId: string,
  proposalId: string,
): Promise<TreeProblem | null> {
  const existing = await projectGroupParents(trx, projectId);
  const rows = (
    await trx
      .selectFrom("tree_proposal_group")
      .selectAll()
      .where("proposal_id", "=", proposalId)
      .orderBy("position")
      .execute()
  ).filter((row) => existing.has(row.group_id) || row.name !== null);
  const kept = new Set(rows.map((row) => row.group_id));
  const parentOf = (row: (typeof rows)[number]) =>
    row.parent_id !== null && (kept.has(row.parent_id) || existing.has(row.parent_id))
      ? row.parent_id
      : null;
  const parents = new Map(existing);
  for (const row of rows) parents.set(row.group_id, parentOf(row));
  if (hasCycle(parents)) return "tree_cycle";

  // Parents first go to the top, so no step on the way to the new tree closes a loop.
  const moved = rows.filter((row) => existing.has(row.group_id)).map((row) => row.group_id);
  if (moved.length > 0) {
    await trx
      .updateTable("element_group")
      .set({ parent_id: null })
      .where("id", "in", moved)
      .execute();
  }
  for (const row of rows) {
    if (existing.has(row.group_id) || row.name === null) continue;
    await trx
      .insertInto("element_group")
      .values({ id: row.group_id, project_id: projectId, name: row.name, position: row.position })
      .execute();
  }
  for (const row of rows) {
    await trx
      .updateTable("element_group")
      .set({
        parent_id: parentOf(row),
        position: row.position,
        min_occurs: row.min_occurs,
        max_occurs: row.max_occurs,
        sub_block: row.sub_block,
        sub_block_title: row.sub_block_title,
        sub_block_url: row.sub_block_url,
      })
      .where("id", "=", row.group_id)
      .execute();
  }

  const elements = await trx
    .selectFrom("tree_proposal_element")
    .innerJoin("element", "element.id", "tree_proposal_element.element_id")
    .select([
      "tree_proposal_element.element_id",
      "tree_proposal_element.group_id",
      "tree_proposal_element.registration",
      "tree_proposal_element.position",
    ])
    .where("tree_proposal_element.proposal_id", "=", proposalId)
    .where("element.project_id", "=", projectId)
    .where("element.merged_into", "is", null)
    .execute();
  const now = new Date();
  await trx
    .updateTable("element")
    .set({ tree_position: null })
    .where("project_id", "=", projectId)
    .execute();
  for (const element of elements) {
    const groupId =
      element.group_id !== null && (kept.has(element.group_id) || existing.has(element.group_id))
        ? element.group_id
        : null;
    await trx
      .updateTable("element")
      .set({
        group_id: groupId,
        registration: element.registration,
        tree_position: element.position,
        updated_at: now,
      })
      .where("id", "=", element.element_id)
      .execute();
  }
  return null;
}
