// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The membership of the acting user, for the author columns of elements and comments. Call it
// only after `withProject` or `readProject` has checked the membership.
import type { Kysely } from "kysely";
import type { DB } from "../db/schema.gen.ts";

/** The member id of `userId` in the project; throws when there is none. */
export async function actorMemberId(
  db: Kysely<DB>,
  projectId: string,
  userId: string,
): Promise<string> {
  const row = await db
    .selectFrom("member")
    .select("id")
    .where("organizationId", "=", projectId)
    .where("userId", "=", userId)
    .executeTakeFirstOrThrow();
  return row.id;
}

/** Who wrote an element or a comment, as only the facilitator sees it (EL2, ADR 0005). */
export interface Author {
  memberId: string;
  name: string;
  email: string;
}

/** Whether the project runs as a Team, where people are named (PR14, ADR 0023). */
export async function isTeamProject(db: Kysely<DB>, projectId: string): Promise<boolean> {
  const row = await db
    .selectFrom("project")
    .select("mode")
    .where("id", "=", projectId)
    .executeTakeFirstOrThrow();
  return row.mode === "team";
}

/**
 * What a participant learns about an author in a Team project: the name, never the address
 * (sign-in security review 2026-11-25). An empty name means the person has none; the screen
 * shows a neutral label.
 */
export interface TeamAuthor {
  name: string;
}

/**
 * The names of the members, empty for a person without one. Call it for a Team project only;
 * a Delphi project never names anyone (Q-ANON-1, ADR 0005).
 */
export async function teamAuthors(
  db: Kysely<DB>,
  memberIds: readonly (string | null)[],
): Promise<Map<string, TeamAuthor>> {
  const ids = [...new Set(memberIds.filter((id): id is string => id !== null))];
  if (ids.length === 0) return new Map();
  const rows = await db
    .selectFrom("member")
    .innerJoin("user", "user.id", "member.userId")
    .select(["member.id", "user.name"])
    .where("member.id", "in", ids)
    .execute();
  return new Map(rows.map((row) => [row.id, { name: row.name.trim() }]));
}
