// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The result of a closed round for every member (DE5, Q-PRIV-3), and the response rate per
// stakeholder group for the facilitator (DE6, R-04). Both count ratings by element and group,
// never by rater (ADR 0005).
import type { Kysely } from "kysely";
import type { Outcome } from "@/lib/consensus";
import type { ElementReference } from "@/lib/elements";
import type { ExpertType } from "@/lib/panel";
import { RATER_ROLES } from "@/lib/project-roles";
import type { DB } from "../db/schema.gen.ts";
import { asFacilitator, asMember, done, type RoundResult, refused } from "./access.ts";
import { answeredCounts, type ConsentResult, consentResultsOf, emptyConsent } from "./consent.ts";
import { inGroupOrder, itemGroupsOf, type RoundGroup } from "./groups.ts";
import {
  type ElementOutcome,
  emptyOutcome,
  findRound,
  kindOf,
  modeOf,
  outcomesOf,
  type RoundRow,
  type RoundSummary,
  type RoundValueOf,
  roundItems,
  summaryOf,
} from "./round.ts";
import type { RoundInput } from "./schemas.ts";
import { type ValueListState, valueListStates } from "./value-rounds.ts";

export interface ElementRoundResult extends ElementOutcome {
  id: string;
  name: string;
  /** The model a reference element refers to (EL26); null for a data element. */
  reference: ElementReference | null;
  /** The outcome written when the round closed. */
  outcome: Outcome;
  /** The element's group (EL18); null for one without, listed after the groups (DE19). */
  group: RoundGroup | null;
  /** In a value round (DT3) the item is a value of the element its group names. */
  value?: RoundValueOf;
  /** In a Team round (DE20): the counts and each answer by name; `result` holds no scores. */
  consent?: ConsentResult;
}

export interface RoundResults {
  round: RoundSummary;
  /** The elements, or in a value round the values under their element (DT3). */
  elements: ElementRoundResult[];
  /** The value lists of a value round and whether each was applied (DT3); empty otherwise. */
  lists: ValueListState[];
}

/**
 * Per element of a closed round: the distribution, the median and the outcome, and the result
 * of every stakeholder group with at least 3 scores (DE5, Q-PRIV-3). For every member, under the
 * group headings in the facilitator's order: rating is over, so the order steers nobody (DE19).
 */
export async function roundResults(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
  deps: { now: Date },
): Promise<RoundResult<RoundResults>> {
  return asMember(db, userId, input.projectId, async (trx, role, roundsVisible) => {
    const round = await findRound(trx, input.projectId, input.roundId);
    if (!round || !roundsVisible || (round.opened_at === null && role !== "facilitator")) {
      return refused("round_not_found");
    }
    if (round.closed_at === null) return refused("round_not_closed");
    const mode = await modeOf(trx, input.projectId);
    const team = mode === "team" && kindOf(round) === "elements";
    const outcomes = team ? new Map<string, ElementOutcome>() : await outcomesOf(trx, round);
    const consent = team ? await consentResultsOf(trx, round.id) : new Map<string, ConsentResult>();
    const rows = await roundItems(trx, round);
    const groupOf = await itemGroupsOf(trx, rows);
    const elements = rows.map((element) => {
      const outcome = outcomes.get(element.id) ?? emptyOutcome(round);
      return {
        ...(team ? { consent: consent.get(element.id) ?? emptyConsent() } : {}),
        id: element.id,
        name: element.name,
        reference: element.reference,
        outcome: element.outcome ?? outcome.result.outcome,
        ...outcome,
        group: groupOf.get(element.id) ?? null,
        ...(element.value ? { value: element.value } : {}),
      };
    });
    return done({
      round: summaryOf(round, deps.now, mode),
      elements: inGroupOrder(elements),
      lists: kindOf(round) === "values" ? await valueListStates(trx, round.id) : [],
    });
  });
}

export interface GroupResponse {
  groupId: string;
  groupName: string;
  expertType: ExpertType;
  /**
   * Raters in the group when the round closed, or now for an open round: participants and a
   * facilitator who joined the group (DE14). A participant who left later still counts.
   */
  invited: number;
  /** Raters with at least one answer in the round. */
  started: number;
  /** Raters with an answer, "unable to rate" included, for every element of the round. */
  completed: number;
}

export interface ResponseRate {
  groups: GroupResponse[];
  /** All groups together, also raters whose stakeholder group was removed since. */
  total: { invited: number; started: number; completed: number };
}

/**
 * The user ids of the raters in each group at `cutoff`, for counting and for the group-size rule
 * of the decision report; they never leave the server.
 */
export async function invitedBy(
  trx: Kysely<DB>,
  projectId: string,
  cutoff: Date,
): Promise<Map<string, Set<string>>> {
  // NOTE: DE6, our own design. Invited is who was in the group at the cutoff: the close time of a
  // closed round, now for an open one. Someone who left later still counts for a closed round.
  const invitedUsers = new Map<string, Set<string>>();
  const addInvited = (rows: { teamId: string; userId: string }[]) => {
    for (const row of rows) {
      const users = invitedUsers.get(row.teamId) ?? new Set<string>();
      users.add(row.userId);
      invitedUsers.set(row.teamId, users);
    }
  };
  addInvited(
    await trx
      .selectFrom("member")
      .innerJoin("teamMember", "teamMember.userId", "member.userId")
      .innerJoin("team", "team.id", "teamMember.teamId")
      .select(["team.id as teamId", "member.userId"])
      .where("member.organizationId", "=", projectId)
      .where("team.organizationId", "=", projectId)
      .where("member.role", "in", RATER_ROLES)
      // A facilitator's member row is as old as the project; their group membership is not.
      .where(
        (eb) => eb.fn<Date>("greatest", ["member.createdAt", "teamMember.createdAt"]),
        "<=",
        cutoff,
      )
      .execute(),
  );
  addInvited(
    await trx
      .selectFrom("team_member_left")
      .innerJoin("team", "team.id", "team_member_left.team_id")
      .innerJoin("member", (join) =>
        join
          .onRef("member.userId", "=", "team_member_left.user_id")
          .onRef("member.organizationId", "=", "team.organizationId"),
      )
      .select(["team.id as teamId", "team_member_left.user_id as userId"])
      .where("team.organizationId", "=", projectId)
      .where("team_member_left.left_at", ">", cutoff)
      .where(
        (eb) => eb.fn<Date>("greatest", ["member.createdAt", "team_member_left.joined_at"]),
        "<=",
        cutoff,
      )
      .execute(),
  );
  return invitedUsers;
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
    return done(await responseRateOf(trx, project.id, round, deps.now));
  });
}

/** The response rate of an opened round; the caller has checked the facilitator's role. */
export async function responseRateOf(
  trx: Kysely<DB>,
  projectId: string,
  round: RoundRow,
  now: Date,
): Promise<ResponseRate> {
  const cutoff = round.closed_at ?? now;
  const elementCount = (await roundItems(trx, round)).length;
  const groups = await trx
    .selectFrom("team")
    .select(["id", "name", "expert_type"])
    .where("organizationId", "=", projectId)
    .orderBy("name")
    .orderBy("id")
    .execute();
  const invitedUsers = await invitedBy(trx, projectId, cutoff);
  const invited = new Map([...invitedUsers].map(([teamId, users]) => [teamId, users.size]));
  // One row per rater code: its group and how many elements it answered. The code itself
  // is only a grouping key here and never leaves this function.
  // A participant who changed group during the round still counts once.
  const raters =
    (await modeOf(trx, projectId)) === "team" && kindOf(round) === "elements"
      ? await answeredCounts(trx, round.id)
      : kindOf(round) === "values"
        ? await trx
            .selectFrom("value_rating")
            .select((eb) => [
              eb.fn.max("team_id").as("team_id"),
              eb.fn.count<string>("value_id").as("answered"),
            ])
            .where("round_id", "=", round.id)
            .groupBy("rating_code_id")
            .execute()
        : await trx
            .selectFrom("rating")
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
  return { groups: rows, total };
}
