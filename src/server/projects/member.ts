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
