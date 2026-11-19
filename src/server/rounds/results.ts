// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The result of a closed round for every member (DE5, Q-PRIV-3), and the response rate per
// stakeholder group for the facilitator (DE6, R-04). Both count ratings by element and group,
// never by rater (ADR 0005).
import type { Kysely } from "kysely";
import type { Outcome } from "@/lib/consensus";
import type { ExpertType } from "@/lib/panel";
import type { DB } from "../db/schema.gen.ts";
import { asFacilitator, asMember, done, type RoundResult, refused } from "./access.ts";
import {
  type ElementOutcome,
  emptyOutcome,
  findRound,
  outcomesOf,
  type RoundSummary,
  roundElements,
  summaryOf,
} from "./round.ts";
import type { RoundInput } from "./schemas.ts";

export interface ElementRoundResult extends ElementOutcome {
  id: string;
  name: string;
  /** The outcome written when the round closed. */
  outcome: Outcome;
}

export interface RoundResults {
  round: RoundSummary;
  elements: ElementRoundResult[];
}

/**
 * Per element of a closed round: the distribution, the median and the outcome, and the result
 * of every stakeholder group with at least 3 scores (DE5, Q-PRIV-3). For every member.
 */
export async function roundResults(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
  deps: { now: Date },
): Promise<RoundResult<RoundResults>> {
  return asMember(db, userId, input.projectId, async (trx, role) => {
    const round = await findRound(trx, input.projectId, input.roundId);
    if (!round || (round.opened_at === null && role !== "facilitator")) {
      return refused("round_not_found");
    }
    if (round.closed_at === null) return refused("round_not_closed");
    const outcomes = await outcomesOf(trx, round);
    const elements = (await roundElements(trx, round.id)).map((element) => {
      const outcome = outcomes.get(element.id) ?? emptyOutcome(round);
      return {
        id: element.id,
        name: element.name,
        outcome: element.outcome ?? outcome.result.outcome,
        ...outcome,
      };
    });
    return done({ round: summaryOf(round, deps.now), elements });
  });
}

export interface GroupResponse {
  groupId: string;
  groupName: string;
  expertType: ExpertType;
  /** Participants of the group who had joined by the time the round closed, or by now. */
  invited: number;
  /** Participants with at least one answer in the round. */
  started: number;
  /** Participants with an answer, "unable to rate" included, for every element of the round. */
  completed: number;
}

export interface ResponseRate {
  groups: GroupResponse[];
  /** All groups together, also raters whose stakeholder group was removed since. */
  total: { invited: number; started: number; completed: number };
}

/**
 * Invited, started and completed participants per stakeholder group of an opened round (DE6),
 * for the facilitator. Started and completed count rating codes per group; no rater is named.
 */
export async function responseRate(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
  deps: { now: Date },
): Promise<RoundResult<ResponseRate>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    const round = await findRound(trx, project.id, input.roundId);
    if (!round) return refused("round_not_found");
    if (round.opened_at === null) return refused("round_not_open");
    const cutoff = round.closed_at ?? deps.now;
    const elementCount = (await roundElements(trx, round.id)).length;
    const groups = await trx
      .selectFrom("team")
      .select(["id", "name", "expert_type"])
      .where("organizationId", "=", project.id)
      .orderBy("name")
      .orderBy("id")
      .execute();
    const invitedRows = await trx
      .selectFrom("member")
      .innerJoin("teamMember", "teamMember.userId", "member.userId")
      .innerJoin("team", "team.id", "teamMember.teamId")
      .select("team.id")
      .select((eb) => eb.fn.count<string>("member.id").distinct().as("count"))
      .where("member.organizationId", "=", project.id)
      .where("team.organizationId", "=", project.id)
      .where("member.role", "=", "participant")
      .where("member.createdAt", "<=", cutoff)
      .groupBy("team.id")
      .execute();
    const invited = new Map(invitedRows.map((row) => [row.id, Number(row.count)]));
    // One row per rater code: its group and how many elements it answered. The code itself
    // is only a grouping key here and never leaves this function.
    const raters = await trx
      .selectFrom("rating")
      // A participant who changed group during the round still counts once.
      .select((eb) => [
        eb.fn.max("team_id").as("team_id"),
        eb.fn.count<string>("element_id").as("answered"),
      ])
      .where("round_id", "=", round.id)
      .groupBy("rating_code_id")
      .execute();
    const started = new Map<string | null, number>();
    const completed = new Map<string | null, number>();
    const total = { invited: 0, started: 0, completed: 0 };
    for (const rater of raters) {
      started.set(rater.team_id, (started.get(rater.team_id) ?? 0) + 1);
      total.started += 1;
      if (Number(rater.answered) >= elementCount) {
        completed.set(rater.team_id, (completed.get(rater.team_id) ?? 0) + 1);
        total.completed += 1;
      }
    }
    const rows = groups.map((group) => {
      const count = invited.get(group.id) ?? 0;
      total.invited += count;
      return {
        groupId: group.id,
        groupName: group.name,
        expertType: group.expert_type as ExpertType,
        invited: count,
        started: started.get(group.id) ?? 0,
        completed: completed.get(group.id) ?? 0,
      };
    });
    return done({ groups: rows, total });
  });
}
