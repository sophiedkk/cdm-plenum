// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Proposals for elements missing from round 1 (DE16). A rater proposes and deletes their own
// while the round is open; the facilitator sees every proposal without its proposer and adds one
// to the board. A proposal carries the rating code only (ADR 0005): who proposed what shows only
// through rater-link.ts, when the round lets the facilitator see the raters (DE4).
import type { Kysely } from "kysely";
import type { DB } from "../db/schema.gen.ts";
import { actorMemberId } from "../projects/member.ts";
import { log, ownGroupId } from "../projects/queries.ts";
import { asFacilitator, asMember, done, type RoundResult, refused } from "./access.ts";
import { ownRatingCode } from "./rater-link.ts";
import { findRound, takesProposals } from "./round.ts";
import type { AddProposalInput, ProposalInput, RoundInput } from "./schemas.ts";

/** The refusals of the round_proposal_in_open_first_round trigger (migration 0008). */
const TRIGGER_REFUSALS = {
  proposal_round_not_open: "round_not_open",
  proposal_not_first_round: "proposals_first_round_only",
} as const;

function triggerRefusal(error: unknown) {
  if (!(error instanceof Error)) return undefined;
  return Object.entries(TRIGGER_REFUSALS).find(([message]) => error.message === message)?.[1];
}

/** A proposal as its proposer sees it. */
export interface OwnProposal {
  id: string;
  name: string;
  description: string;
}

/** A proposal as the facilitator sees it: never who made it. */
export interface RoundProposal extends OwnProposal {
  /** The board element made from it, or null while it is not on the board. */
  elementId: string | null;
}

/**
 * The checks every proposer action shares: a rater (a facilitator only from a stakeholder
 * group, DE14), an opened round 1 of the project, and the rater's code.
 */
async function proposerContext(
  trx: Kysely<DB>,
  userId: string,
  input: RoundInput,
  role: string,
): Promise<RoundResult<{ roundId: string; code: string }>> {
  if (role === "facilitator" && (await ownGroupId(trx, input.projectId, userId)) === null) {
    return refused("rater_group_required");
  }
  const round = await findRound(trx, input.projectId, input.roundId, "share");
  if (!round || round.opened_at === null) return refused("round_not_found");
  if (!takesProposals(round)) return refused("proposals_first_round_only");
  const code = await ownRatingCode(trx, input.projectId, userId);
  if (!code) return refused("forbidden");
  return done({ roundId: round.id, code });
}

/**
 * Adds a proposal for a missing element to round 1 while it is open (DE16). The database takes
 * it only then; its refusals come back as `round_not_open` and `proposals_first_round_only`.
 */
export async function addProposal(
  db: Kysely<DB>,
  userId: string,
  input: AddProposalInput,
): Promise<RoundResult<{ proposalId: string }>> {
  try {
    return await asMember(db, userId, input.projectId, async (trx, role) => {
      const context = await proposerContext(trx, userId, input, role);
      if (!context.ok) return context;
      const row = await trx
        .insertInto("round_proposal")
        .values({
          round_id: context.value.roundId,
          rating_code_id: context.value.code,
          name: input.name,
          description: input.description,
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      // NOTE: Q-PRIV-2. The round is the target: the log says that someone proposed, not what.
      await log(trx, userId, input.projectId, "proposal_added", "round", context.value.roundId);
      return done({ proposalId: row.id });
    });
  } catch (error) {
    const refusal = triggerRefusal(error);
    if (refusal) return refused(refusal);
    throw error;
  }
}

/** Deletes one of the rater's own proposals while round 1 is open (DE16). */
export async function deleteProposal(
  db: Kysely<DB>,
  userId: string,
  input: ProposalInput,
): Promise<RoundResult<null>> {
  return asMember(db, userId, input.projectId, async (trx, role) => {
    const context = await proposerContext(trx, userId, input, role);
    if (!context.ok) return context;
    // The trigger guards inserts only, so the open check for a delete is here, against the
    // database clock the trigger uses.
    const open = await trx
      .selectFrom("round")
      .select("id")
      .where("id", "=", context.value.roundId)
      .where("closed_at", "is", null)
      .where("closes_at", ">", (eb) => eb.fn<Date>("now"))
      .executeTakeFirst();
    if (!open) return refused("round_not_open");
    const deleted = await trx
      .deleteFrom("round_proposal")
      .where("id", "=", input.proposalId)
      .where("round_id", "=", context.value.roundId)
      .where("rating_code_id", "=", context.value.code)
      .executeTakeFirst();
    // Another rater's proposal is answered as unknown, so its existence is not revealed.
    if (deleted.numDeletedRows === 0n) return refused("proposal_not_found");
    await log(trx, userId, input.projectId, "proposal_deleted", "round", context.value.roundId);
    return done(null);
  });
}

/** The signed-in member's own proposals in a round, oldest first; empty without a code. */
export async function myProposals(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
): Promise<RoundResult<OwnProposal[]>> {
  return asMember(db, userId, input.projectId, async (trx, role, roundsVisible) => {
    const round = await findRound(trx, input.projectId, input.roundId);
    if (!round || !roundsVisible || (round.opened_at === null && role !== "facilitator")) {
      return refused("round_not_found");
    }
    const code = await ownRatingCode(trx, input.projectId, userId);
    if (code === null) return done([]);
    const rows = await trx
      .selectFrom("round_proposal")
      .select(["id", "name", "description"])
      .where("round_id", "=", round.id)
      .where("rating_code_id", "=", code)
      .orderBy("created_at")
      .orderBy("id")
      .execute();
    return done(rows);
  });
}

/**
 * Every proposal of a round for the facilitator, in alphabetical order so the order says nothing
 * about who proposed what or when (DE16, ADR 0005).
 */
export async function roundProposals(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
): Promise<RoundResult<RoundProposal[]>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    const round = await findRound(trx, project.id, input.roundId);
    if (!round) return refused("round_not_found");
    const rows = await trx
      .selectFrom("round_proposal")
      .select(["id", "name", "description", "element_id as elementId"])
      .where("round_id", "=", round.id)
      .orderBy((eb) => eb.fn("lower", ["name"]))
      .orderBy("id")
      .execute();
    return done(rows);
  });
}

/**
 * Adds a proposal to the board as a new element with a `delphi` source labelled by the round
 * number (DE16). The facilitator becomes the element's author, so the board never names the
 * proposer. Each proposal goes on the board once.
 */
export async function addProposalToBoard(
  db: Kysely<DB>,
  userId: string,
  input: ProposalInput,
): Promise<RoundResult<{ elementId: string }>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    const round = await findRound(trx, project.id, input.roundId);
    if (!round) return refused("round_not_found");
    const proposal = await trx
      .selectFrom("round_proposal")
      .select(["id", "name", "description", "element_id"])
      .where("id", "=", input.proposalId)
      .where("round_id", "=", round.id)
      .forUpdate()
      .executeTakeFirst();
    if (!proposal) return refused("proposal_not_found");
    if (proposal.element_id !== null) return refused("proposal_already_on_board");
    const element = await trx
      .insertInto("element")
      .values({
        project_id: project.id,
        name: proposal.name,
        description: proposal.description,
        author_member_id: await actorMemberId(trx, project.id, userId),
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await trx
      .insertInto("element_source")
      .values({ element_id: element.id, kind: "delphi", label: String(round.number) })
      .execute();
    await trx
      .updateTable("round_proposal")
      .set({ element_id: element.id })
      .where("id", "=", proposal.id)
      .execute();
    await log(trx, userId, project.id, "proposal_added_to_board", "element", element.id);
    return done({ elementId: element.id });
  });
}
