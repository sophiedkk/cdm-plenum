// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// NOTE: ADR 0005. The only module that reads the rating_code table, through exactly two queries:
// the signed-in member's own code, and the facilitator's ratings by participant. anonymity.test.ts
// fails when another module names the table.
import { type Kysely, sql } from "kysely";
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
  /** By item: `elementId` is the element, or in a value round the value (DT3). */
  ratings: { elementId: string; score: number | null; reason: string | null }[];
  /** The ids of the elements the participant proposed in this round (DE16). */
  proposalIds: string[];
  /** The ids of the detail flags the participant set in this round (DE17). */
  flagIds: string[];
}

/**
 * Query 2 of 2: who gave which rating, proposed which element and set which detail flag in a
 * round (DE4, DE16, DE17), or rated which value of a value round (DT3). The caller runs it only
 * for the facilitator of a round whose `facilitator_sees_raters` is true. The four are one union,
 * so the code-to-member table is read once.
 */
export async function ratingsByParticipantQuery(
  db: Kysely<DB>,
  projectId: string,
  roundId: string,
): Promise<ParticipantRatings[]> {
  const entries = db
    .selectFrom("rating")
    .select((eb) => [
      "rating.rating_code_id as codeId",
      "rating.team_id as teamId",
      eb.ref("rating.element_id").$castTo<string | null>().as("elementId"),
      "rating.score",
      "rating.reason",
      sql<string | null>`null::uuid`.as("proposalId"),
      sql<string | null>`null::uuid`.as("flagId"),
    ])
    .where("rating.round_id", "=", roundId)
    .unionAll((eb) =>
      eb
        .selectFrom("value_rating")
        .select((eb) => [
          "value_rating.rating_code_id as codeId",
          "value_rating.team_id as teamId",
          eb.ref("value_rating.value_id").$castTo<string | null>().as("elementId"),
          "value_rating.score",
          "value_rating.reason",
          sql<string | null>`null::uuid`.as("proposalId"),
          sql<string | null>`null::uuid`.as("flagId"),
        ])
        .where("value_rating.round_id", "=", roundId),
    )
    .unionAll((eb) =>
      eb
        .selectFrom("round_proposal")
        .select((eb) => [
          "round_proposal.rating_code_id as codeId",
          sql<string | null>`null::text`.as("teamId"),
          sql<string | null>`null::uuid`.as("elementId"),
          sql<number | null>`null::smallint`.as("score"),
          sql<string | null>`null::text`.as("reason"),
          eb.ref("round_proposal.id").$castTo<string | null>().as("proposalId"),
          sql<string | null>`null::uuid`.as("flagId"),
        ])
        .where("round_proposal.round_id", "=", roundId),
    )
    .unionAll((eb) =>
      eb
        .selectFrom("detail_flag")
        .select((eb) => [
          "detail_flag.rating_code_id as codeId",
          sql<string | null>`null::text`.as("teamId"),
          sql<string | null>`null::uuid`.as("elementId"),
          sql<number | null>`null::smallint`.as("score"),
          sql<string | null>`null::text`.as("reason"),
          sql<string | null>`null::uuid`.as("proposalId"),
          eb.ref("detail_flag.id").$castTo<string | null>().as("flagId"),
        ])
        .where("detail_flag.round_id", "=", roundId),
    );
  const rows = await db
    .selectFrom(entries.as("entry"))
    .innerJoin("rating_code", "rating_code.id", "entry.codeId")
    .innerJoin("member", "member.id", "rating_code.member_id")
    .innerJoin("user", "user.id", "member.userId")
    .leftJoin("team", "team.id", "entry.teamId")
    .select([
      "member.id as memberId",
      "user.name",
      "user.email",
      "team.name as groupName",
      "entry.elementId",
      "entry.score",
      "entry.reason",
      "entry.proposalId",
      "entry.flagId",
    ])
    .where("rating_code.project_id", "=", projectId)
    .orderBy("user.email")
    .orderBy("member.id")
    .orderBy("entry.elementId")
    .orderBy("entry.proposalId")
    .orderBy("entry.flagId")
    .execute();
  const byMember = new Map<string, ParticipantRatings>();
  for (const row of rows) {
    let participant = byMember.get(row.memberId);
    if (!participant) {
      participant = {
        memberId: row.memberId,
        name: row.name,
        email: row.email,
        groupName: null,
        ratings: [],
        proposalIds: [],
        flagIds: [],
      };
      byMember.set(row.memberId, participant);
    }
    if (row.flagId !== null) {
      participant.flagIds.push(row.flagId);
    } else if (row.proposalId !== null) {
      participant.proposalIds.push(row.proposalId);
    } else if (row.elementId !== null) {
      if (participant.ratings.length === 0) participant.groupName = row.groupName;
      participant.ratings.push({ elementId: row.elementId, score: row.score, reason: row.reason });
    }
  }
  return [...byMember.values()];
}
