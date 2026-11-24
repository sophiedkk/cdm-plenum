// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Value rounds (DT3, owner decision 2026-11-24). The facilitator puts the value list of a
// structure proposal into a value round from the Details page; one round can hold the lists of
// several elements. The round runs on the Rounds page like an element round. Once it is closed,
// the facilitator applies a list: the values it kept become a new version of the proposal, which
// the group answers by consent (DT2). The round is advice and settles nothing itself.
// NOTE: DT3, our own design. Closing applies nothing: the facilitator applies each list, because
// one element's result may be stale (`value_list_changed`) while another's is not.
import type { Kysely, Transaction } from "kysely";
import { DEFAULT_RULE, type Outcome } from "@/lib/consensus";
import { DETAIL_PHASE, preparesAhead } from "@/lib/phase-access";
import type { DB } from "../db/schema.gen.ts";
import { inValueRound, modelElements, writeStructure } from "../details/queries.ts";
import { actorMemberId } from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import { asFacilitator, done, type RoundResult, refused } from "./access.ts";
import { nextRoundNumber } from "./queries.ts";
import { findRound, kindOf } from "./round.ts";
import type { RoundValueListInput, ValueListInput } from "./schemas.ts";

/** How long a new value round runs by default; the facilitator changes it before opening. */
// NOTE: no spec governs this, our own design: two weeks, the same span the round form starts
// from, so a value round opened without a change still gives raters time.
export const VALUE_ROUND_DAYS = 14;
const DAY = 86_400_000;

/** The structure proposal of an element in the model, locked, when it belongs to the project. */
async function lockedStructure(trx: Transaction<DB>, projectId: string, proposalId: string) {
  return trx
    .selectFrom("detail_proposal")
    .innerJoin("element", "element.id", "detail_proposal.element_id")
    .select([
      "detail_proposal.id",
      // The joined element's id: never null, unlike the proposal's own column (DT6 trees).
      "element.id as element_id",
      "detail_proposal.version",
      "detail_proposal.settled_at",
      "detail_proposal.data_type",
      "detail_proposal.min_occurs",
      "detail_proposal.max_occurs",
    ])
    .where("detail_proposal.id", "=", proposalId)
    .where("detail_proposal.kind", "=", "structure")
    .where("element.project_id", "=", projectId)
    .where("element.merged_into", "is", null)
    .forUpdate("detail_proposal")
    .executeTakeFirst();
}

async function proposalValues(db: Kysely<DB>, proposalId: string) {
  const rows = await db
    .selectFrom("detail_proposal_value")
    .select(["position", "text", "value"])
    .where("proposal_id", "=", proposalId)
    .orderBy("position")
    .execute();
  return rows.map((row) => ({
    position: row.position,
    text: row.text,
    value: row.value === null ? null : Number(row.value),
  }));
}

/**
 * Puts the value list of a structure proposal into a value round (DT3, facilitator only): into
 * the draft value round when there is one, or into a new draft with the DE1 rule that closes in
 * {@link VALUE_ROUND_DAYS} days. The facilitator prepares it up to and in the detail phase
 * (`phase_closed`, PR10). Refused with `value_list_not_found` for anything but the structure
 * proposal of an element in the model, `value_list_empty` for a proposal without values (a
 * reference element, EL26, never has any), `value_list_settled` once settled,
 * `value_list_in_round` while the list is in a round that is not closed, and
 * `previous_round_not_closed` while a value round is open.
 */
export async function addValueList(
  db: Kysely<DB>,
  userId: string,
  input: ValueListInput,
  deps: { now: Date },
): Promise<RoundResult<{ roundId: string; number: number }>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    if (!preparesAhead(project.phase, DETAIL_PHASE)) return refused("phase_closed");
    const proposal = await lockedStructure(trx, project.id, input.proposalId);
    if (!proposal) return refused("value_list_not_found");
    const inModel = (await modelElements(trx, project.id)).some(
      (element) => element.id === proposal.element_id,
    );
    if (!inModel) return refused("value_list_not_found");
    if (proposal.settled_at !== null) return refused("value_list_settled");
    const values = await proposalValues(trx, proposal.id);
    if (values.length === 0) return refused("value_list_empty");
    if (await inValueRound(trx, proposal.id)) return refused("value_list_in_round");

    const newest = await trx
      .selectFrom("round")
      .selectAll()
      .where("project_id", "=", project.id)
      .where("kind", "=", "values")
      .orderBy("number", "desc")
      .forUpdate()
      .executeTakeFirst();
    if (newest && newest.opened_at !== null && newest.closed_at === null) {
      return refused("previous_round_not_closed");
    }
    const round =
      newest && newest.opened_at === null
        ? newest
        : await trx
            .insertInto("round")
            .values({
              project_id: project.id,
              kind: "values",
              number: await nextRoundNumber(trx, project.id),
              scale_min: DEFAULT_RULE.scaleMin,
              scale_max: DEFAULT_RULE.scaleMax,
              bottom_band_max: DEFAULT_RULE.bottomBandMax,
              top_band_min: DEFAULT_RULE.topBandMin,
              agreement_pct: DEFAULT_RULE.agreementPct,
              opposition_pct: DEFAULT_RULE.oppositionPct,
              closes_at: new Date(deps.now.getTime() + VALUE_ROUND_DAYS * DAY),
            })
            .returningAll()
            .executeTakeFirstOrThrow();
    if (round !== newest) await log(trx, userId, project.id, "round_created", "round", round.id);
    await trx
      .insertInto("round_value_list")
      .values({ round_id: round.id, proposal_id: proposal.id, version: proposal.version })
      .execute();
    await trx
      .insertInto("round_value")
      .values(values.map((value) => ({ round_id: round.id, proposal_id: proposal.id, ...value })))
      .execute();
    await log(trx, userId, project.id, "value_list_added", "round", round.id);
    return done({ roundId: round.id, number: round.number });
  });
}

/** Takes a value list out of a draft value round (DT3, facilitator only). */
export async function removeValueList(
  db: Kysely<DB>,
  userId: string,
  input: RoundValueListInput,
): Promise<RoundResult<null>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    const round = await findRound(trx, project.id, input.roundId, "update");
    if (!round || kindOf(round) !== "values") return refused("round_not_found");
    if (round.opened_at !== null) return refused("round_not_draft");
    const removed = await trx
      .deleteFrom("round_value_list")
      .where("round_id", "=", round.id)
      .where("proposal_id", "=", input.proposalId)
      .returning("proposal_id")
      .executeTakeFirst();
    if (!removed) return refused("value_list_not_found");
    await log(trx, userId, project.id, "value_list_removed", "round", round.id);
    return done(null);
  });
}

/** A value list of a value round and what became of it (DT3). */
export interface ValueListState {
  proposalId: string;
  elementId: string;
  elementName: string;
  /** The version of the structure proposal the round rated. */
  version: number;
  /** The proposal's version now; another than `version` once it was revised since. */
  currentVersion: number;
  /** The version applying made; null until applied. */
  appliedVersion: number | null;
  /** How many values the round rated, and how many it kept (outcome `included`). */
  total: number;
  kept: number;
}

/** The value lists of a value round, in the order of the board (DT3). */
export async function valueListStates(db: Kysely<DB>, roundId: string): Promise<ValueListState[]> {
  const rows = await db
    .selectFrom("round_value_list")
    .innerJoin("detail_proposal", "detail_proposal.id", "round_value_list.proposal_id")
    .innerJoin("element", "element.id", "detail_proposal.element_id")
    .leftJoin("round_value", (join) =>
      join
        .onRef("round_value.round_id", "=", "round_value_list.round_id")
        .onRef("round_value.proposal_id", "=", "round_value_list.proposal_id"),
    )
    .select((eb) => [
      "round_value_list.proposal_id",
      "round_value_list.version",
      "round_value_list.applied_version",
      "detail_proposal.version as current_version",
      "element.id as element_id",
      "element.name as element_name",
      eb.fn.count<string>("round_value.id").as("total"),
      eb.fn
        .count<string>("round_value.id")
        .filterWhere("round_value.outcome", "=", "included" satisfies Outcome)
        .as("kept"),
    ])
    .where("round_value_list.round_id", "=", roundId)
    .groupBy([
      "round_value_list.proposal_id",
      "round_value_list.version",
      "round_value_list.applied_version",
      "detail_proposal.version",
      "element.id",
      "element.name",
      "element.created_at",
    ])
    .orderBy("element.created_at")
    .orderBy("element.id")
    .execute();
  return rows.map((row) => ({
    proposalId: row.proposal_id,
    elementId: row.element_id,
    elementName: row.element_name,
    version: row.version,
    currentVersion: row.current_version,
    appliedVersion: row.applied_version,
    total: Number(row.total),
    kept: Number(row.kept),
  }));
}

/**
 * Applies a closed value round to one structure proposal (DT3, facilitator only): the values
 * the round kept, in their order, become a new version with the same data type and cardinality,
 * which every member answers again (DT2). Refused with `round_not_closed` before the round
 * closes, `value_list_applied` when done before, `value_list_changed` when the proposal has a
 * newer version than the round rated, `value_list_unchanged` when the round kept every value,
 * and `phase_closed` once the project is past the detail phase (PR10).
 */
export async function applyValueList(
  db: Kysely<DB>,
  userId: string,
  input: RoundValueListInput,
): Promise<RoundResult<{ version: number }>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    if (!preparesAhead(project.phase, DETAIL_PHASE)) return refused("phase_closed");
    const round = await findRound(trx, project.id, input.roundId, "update");
    if (!round || kindOf(round) !== "values") return refused("round_not_found");
    if (round.closed_at === null) return refused("round_not_closed");
    const list = await trx
      .selectFrom("round_value_list")
      .selectAll()
      .where("round_id", "=", round.id)
      .where("proposal_id", "=", input.proposalId)
      .forUpdate()
      .executeTakeFirst();
    if (!list) return refused("value_list_not_found");
    if (list.applied_version !== null) return refused("value_list_applied");
    const proposal = await lockedStructure(trx, project.id, list.proposal_id);
    if (!proposal) return refused("value_list_not_found");
    if (proposal.version !== list.version) return refused("value_list_changed");
    const rated = await trx
      .selectFrom("round_value")
      .select(["text", "value", "outcome"])
      .where("round_id", "=", round.id)
      .where("proposal_id", "=", list.proposal_id)
      .orderBy("position")
      .execute();
    const kept = rated
      .filter((value) => (value.outcome as Outcome | null) === "included")
      .map((value) => ({
        text: value.text,
        value: value.value === null ? null : Number(value.value),
      }));
    if (kept.length === rated.length) return refused("value_list_unchanged");
    const saved = await writeStructure(trx, proposal.element_id, proposal, {
      data_type: proposal.data_type,
      min_occurs: proposal.min_occurs,
      max_occurs: proposal.max_occurs,
      proposer_member_id: await actorMemberId(trx, project.id, userId),
      proposer_expert_type: null,
      values: kept,
    });
    await trx
      .updateTable("round_value_list")
      .set({ applied_version: saved.version, applied_at: new Date() })
      .where("round_id", "=", round.id)
      .where("proposal_id", "=", list.proposal_id)
      .execute();
    await log(trx, userId, project.id, "value_list_applied", "detail_proposal", saved.id);
    return done({ version: saved.version });
  });
}
