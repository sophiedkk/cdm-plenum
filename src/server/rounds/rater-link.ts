// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// NOTE: ADR 0005. The only module that reads the rating_code table, through exactly two queries:
// the signed-in member's own code, and the facilitator's ratings by participant. anonymity.test.ts
// fails when another module names the table.
import type { Kysely } from "kysely";
import type { DB } from "../db/schema.gen.ts";

/**
 * Query 1 of 2: the rating code of the signed-in user in the project, for their own ratings
 * (DE3, DE7). Returns `null` when the user has none.
 */
export async function ownRatingCode(
  db: Kysely<DB>,
  projectId: string,
  userId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("rating_code")
    .innerJoin("member", "member.id", "rating_code.member_id")
    .select("rating_code.id")
    .where("rating_code.project_id", "=", projectId)
    .where("member.organizationId", "=", projectId)
    .where("member.userId", "=", userId)
    .executeTakeFirst();
  return row?.id ?? null;
}

export interface ParticipantRatings {
  memberId: string;
  name: string;
  email: string;
  /** The stakeholder group the participant rated in; null when that group was removed. */
  groupName: string | null;
  ratings: { elementId: string; score: number | null; reason: string | null }[];
}

/**
 * Query 2 of 2: who gave which rating in a round (DE4). The caller runs it only for the
 * facilitator of a round whose `facilitator_sees_raters` is true.
 */
export async function ratingsByParticipantQuery(
  db: Kysely<DB>,
  projectId: string,
  roundId: string,
): Promise<ParticipantRatings[]> {
  const rows = await db
    .selectFrom("rating")
    .innerJoin("rating_code", "rating_code.id", "rating.rating_code_id")
    .innerJoin("member", "member.id", "rating_code.member_id")
    .innerJoin("user", "user.id", "member.userId")
    .leftJoin("team", "team.id", "rating.team_id")
    .select([
      "member.id as memberId",
      "user.name",
      "user.email",
      "team.name as groupName",
      "rating.element_id as elementId",
      "rating.score",
      "rating.reason",
    ])
    .where("rating.round_id", "=", roundId)
    .where("rating_code.project_id", "=", projectId)
    .orderBy("user.email")
    .orderBy("member.id")
    .orderBy("rating.element_id")
    .execute();
  const byMember = new Map<string, ParticipantRatings>();
  for (const row of rows) {
    let participant = byMember.get(row.memberId);
    if (!participant) {
      participant = {
        memberId: row.memberId,
        name: row.name,
        email: row.email,
        groupName: row.groupName,
        ratings: [],
      };
      byMember.set(row.memberId, participant);
    }
    participant.ratings.push({ elementId: row.elementId, score: row.score, reason: row.reason });
  }
  return [...byMember.values()];
}
