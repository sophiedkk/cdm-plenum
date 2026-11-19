// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Which stakeholder groups the anonymised ratings export (EX4) may name (Q-PRIV-3). The group of
// a rating is the one stored on the rating when it was saved, so this never reads the
// code-to-member table (ADR 0005).
import { MIN_GROUP_SCORES } from "@/lib/consensus";

/** One exported rating: the participant's code and the group stored on the rating, if any. */
export interface RatedGroup {
  code: string;
  groupId: string | null;
}

/**
 * The smallest number of participants a group named in the ratings export holds. No source sets
 * a number for this; it reuses the Q-PRIV-3 minimum of group results.
 */
export const MIN_GROUP_SIZE = MIN_GROUP_SCORES;

/**
 * The groups the export may name. A group with ratings from fewer than `min` participants is left
 * out. When the left-out groups hold fewer than `min` participants together, the smallest named
 * groups are left out too, so no code can be traced by elimination.
 */
export function shownGroups(rows: readonly RatedGroup[], min = MIN_GROUP_SIZE): Set<string> {
  const codes = new Map<string, Set<string>>();
  for (const row of rows) {
    if (row.groupId === null) continue;
    const set = codes.get(row.groupId) ?? new Set<string>();
    set.add(row.code);
    codes.set(row.groupId, set);
  }
  const hiddenCodes = new Set<string>();
  const remaining: [string, number][] = [];
  for (const [groupId, set] of codes) {
    if (set.size < min) for (const code of set) hiddenCodes.add(code);
    else remaining.push([groupId, set.size]);
  }
  remaining.sort(([a, x], [b, y]) => x - y || a.localeCompare(b));
  while (hiddenCodes.size > 0 && hiddenCodes.size < min && remaining.length > 0) {
    const [groupId] = remaining.shift() as [string, number];
    for (const code of codes.get(groupId) ?? []) hiddenCodes.add(code);
  }
  return new Set(remaining.map(([groupId]) => groupId));
}
