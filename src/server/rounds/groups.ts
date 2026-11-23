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

/** The group of each element, by element id; an element without a group is absent. */
export async function groupsOf(
  db: Kysely<DB>,
  elementIds: readonly string[],
): Promise<Map<string, PlacedGroup>> {
  const groups = new Map<string, PlacedGroup>();
  if (elementIds.length === 0) return groups;
  const rows = await db
    .selectFrom("element")
    .innerJoin("element_group", "element_group.id", "element.group_id")
    .select([
      "element.id as element_id",
      "element_group.id",
      "element_group.name",
      "element_group.prompt",
      "element_group.position",
    ])
    .where("element.id", "in", elementIds)
    .execute();
  for (const row of rows) {
    groups.set(row.element_id, {
      id: row.id,
      name: row.name,
      prompt: isElementPrompt(row.prompt) ? row.prompt : null,
      position: row.position,
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
