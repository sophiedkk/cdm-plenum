// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The stakeholder group of each rating code, for the anonymised ratings export (EX4).
import type { Kysely, Transaction } from "kysely";
import type { DB } from "../db/schema.gen.ts";

/** A rating code with the stakeholder group its participant is in, or null for none. */
export interface CodeGroup {
  code: string;
  groupId: string | null;
  groupName: string | null;
}

/**
 * The group of every rating code that has a rating in a closed round of the project.
 *
 * NOTE: ADR 0005 lets two queries read the code-to-member table. This is a third one: a group can
 * only be found through the member. The join stays inside SQL and the query returns no member id
 * or user id, so the export can never carry one.
 */
export async function ratingCodeGroups(
  trx: Kysely<DB> | Transaction<DB>,
  projectId: string,
): Promise<CodeGroup[]> {
  const rows = await trx
    .selectFrom("rating_code")
    .innerJoin("member", "member.id", "rating_code.member_id")
    .leftJoin("teamMember", "teamMember.userId", "member.userId")
    .leftJoin("team", (join) =>
      join
        .onRef("team.id", "=", "teamMember.teamId")
        .onRef("team.organizationId", "=", "rating_code.project_id"),
    )
    .select(["rating_code.id as code", "team.id as groupId", "team.name as groupName"])
    .where("rating_code.project_id", "=", projectId)
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("rating")
          .innerJoin("round", "round.id", "rating.round_id")
          .select("rating.round_id")
          .whereRef("rating.rating_code_id", "=", "rating_code.id")
          .where("round.closed_at", "is not", null),
      ),
    )
    .execute();
  // A participant is in one group of the project (PR3); the left joins also return the rows of
  // the user's groups in other projects with a null team, and a code in two groups gets none.
  const byCode = new Map<string, CodeGroup>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    if (row.groupId === null) {
      if (!byCode.has(row.code))
        byCode.set(row.code, { code: row.code, groupId: null, groupName: null });
      continue;
    }
    const known = byCode.get(row.code);
    if (known?.groupId && known.groupId !== row.groupId) ambiguous.add(row.code);
    else byCode.set(row.code, { code: row.code, groupId: row.groupId, groupName: row.groupName });
  }
  for (const code of ambiguous) byCode.set(code, { code, groupId: null, groupName: null });
  return [...byCode.values()];
}

/** The smallest number of participants a group shown in the ratings export holds (Q-PRIV-3). */
export const MIN_GROUP_SIZE = 3;

/**
 * Picks the group name the ratings export shows per code. A group with fewer than `min` raters is
 * left empty (Q-PRIV-3). When that leaves fewer than `min` codes without a group, the smallest
 * shown groups are left empty too, so no code can be traced by elimination.
 */
export function shownGroups(
  codes: readonly CodeGroup[],
  min = MIN_GROUP_SIZE,
): Map<string, string | null> {
  const members = new Map<string, CodeGroup[]>();
  for (const code of codes) {
    if (code.groupId === null) continue;
    members.set(code.groupId, [...(members.get(code.groupId) ?? []), code]);
  }
  const hidden = new Set<string>();
  let hiddenCodes = 0;
  for (const [groupId, list] of members) {
    if (list.length < min) {
      hidden.add(groupId);
      hiddenCodes += list.length;
    }
  }
  const remaining = [...members.entries()]
    .filter(([groupId]) => !hidden.has(groupId))
    .sort(([a, x], [b, y]) => x.length - y.length || a.localeCompare(b));
  while (hiddenCodes > 0 && hiddenCodes < min && remaining.length > 0) {
    const [groupId, list] = remaining.shift() as [string, CodeGroup[]];
    hidden.add(groupId);
    hiddenCodes += list.length;
  }
  return new Map(
    codes.map((code) => [
      code.code,
      code.groupId === null || hidden.has(code.groupId) ? null : code.groupName,
    ]),
  );
}
