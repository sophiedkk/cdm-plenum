// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The groups of a round's elements (EL18) as the rounds show them (DE19): the rating card and its
// overview in an order per participant, the results in the facilitator's order.
import type { Kysely } from "kysely";
import { type ElementPrompt, isElementPrompt } from "@/lib/brainstorm";
import type { DB } from "../db/schema.gen.ts";

/** The group an element sits in (EL18), as a round names it (DE19). */
export interface RoundGroup {
  id: string;
  name: string | null;
  prompt: ElementPrompt | null;
}

export type PlacedGroup = RoundGroup & { position: number };

/**
 * The group of each element, by element id; an element without a group is absent. In a tree
 * (DT6) that is the group at the top of the model that holds the element's group.
 */
// NOTE: no spec governs this, our own design: a round heading per top-level group keeps the
// per-participant order of DE19 on whole parts of the model, and a nested group stays together.
export async function groupsOf(
  db: Kysely<DB>,
  elementIds: readonly string[],
): Promise<Map<string, PlacedGroup>> {
  const groups = new Map<string, PlacedGroup>();
  if (elementIds.length === 0) return groups;
  const placed = await db
    .selectFrom("element")
    .select(["id", "project_id", "group_id"])
    .where("id", "in", elementIds)
    .where("group_id", "is not", null)
    .execute();
  if (placed.length === 0) return groups;
  const rows = await db
    .selectFrom("element_group")
    .select(["id", "parent_id", "name", "prompt", "position"])
    .where("project_id", "in", [...new Set(placed.map((row) => row.project_id))])
    .execute();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const top = (id: string) => {
    let group = byId.get(id);
    const seen = new Set<string>();
    while (group?.parent_id && byId.has(group.parent_id) && !seen.has(group.id)) {
      seen.add(group.id);
      group = byId.get(group.parent_id);
    }
    return group;
  };
  for (const row of placed) {
    const group = row.group_id === null ? undefined : top(row.group_id);
    if (!group) continue;
    groups.set(row.id, {
      id: group.id,
      name: group.name,
      prompt: isElementPrompt(group.prompt) ? group.prompt : null,
      position: group.position,
    });
  }
  return groups;
}

/**
 * The elements block by block, each group's elements in the round's order, the elements without
 * a group last. `order` takes the group ids in the facilitator's order and returns the order to
 * show; leave it out to keep the facilitator's.
 */
export function inGroupOrder<E extends { group: PlacedGroup | null }>(
  elements: readonly E[],
  order: (groupIds: string[]) => string[] = (groupIds) => groupIds,
): (Omit<E, "group"> & { group: RoundGroup | null })[] {
  const ids = [
    ...new Map(
      elements.flatMap((element) =>
        element.group === null ? [] : [[element.group.id, element.group.position] as const],
      ),
    ),
  ]
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => id);
  const shown = order(ids);
  const rank = (element: E) =>
    element.group === null ? shown.length : shown.indexOf(element.group.id);
  return [...elements]
    .map((element, index) => ({ element, index }))
    .sort((a, b) => rank(a.element) - rank(b.element) || a.index - b.index)
    .map(({ element }) => ({
      ...element,
      group:
        element.group === null
          ? null
          : { id: element.group.id, name: element.group.name, prompt: element.group.prompt },
    }));
}
