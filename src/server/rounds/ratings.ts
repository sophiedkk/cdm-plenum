// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Rating in an open round (DE3), a participant's own ratings with the previous round next to
// them (DE7, DE8), and the facilitator's view by participant when the round allows it (DE4).
// Ratings carry the rating code only; rater-link.ts is the one place that resolves it (ADR 0005).
import type { Kysely } from "kysely";
import type { DB } from "../db/schema.gen.ts";
import { log, ownGroupId } from "../projects/queries.ts";
import { asFacilitator, asMember, done, type RoundResult, refused } from "./access.ts";
import { type OwnFlag, ownFlags } from "./flags.ts";
import { ownRatingCode, type ParticipantRatings, ratingsByParticipantQuery } from "./rater-link.ts";
import {
  type ElementOutcome,
  emptyOutcome,
  findRound,
  outcomesOf,
  type RoundSummary,
  roundElements,
  summaryOf,
} from "./round.ts";
import type { RatingInput, RoundInput, SaveRatingInput } from "./schemas.ts";

/** The refusals of the rating_in_open_round trigger (migration 0002), by their message. */
const TRIGGER_REFUSALS = {
  rating_round_not_open: "round_not_open",
  rating_score_out_of_scale: "score_out_of_scale",
} as const;

function triggerRefusal(error: unknown) {
  if (!(error instanceof Error)) return undefined;
  return Object.entries(TRIGGER_REFUSALS).find(([message]) => error.message === message)?.[1];
}

function cleanReason(reason: string | undefined): string | null {
  const trimmed = reason?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/**
 * Saves or changes the rater's rating of one element (DE3); a null score is "unable to rate".
 * A facilitator rates only from their own stakeholder group (DE14, `rater_group_required`).
 * The database accepts it only while the round is open and the score is on its scale; its
 * refusals come back as `round_not_open` and `score_out_of_scale`.
 */
export async function saveRating(
  db: Kysely<DB>,
  userId: string,
  input: SaveRatingInput,
): Promise<RoundResult<null>> {
  try {
    return await asMember(db, userId, input.projectId, async (trx, role) => {
      const teamId = await ownGroupId(trx, input.projectId, userId);
      if (role === "facilitator" && teamId === null) return refused("rater_group_required");
      const round = await findRound(trx, input.projectId, input.roundId, "share");
      if (!round || round.opened_at === null) return refused("round_not_found");
      const inRound = await trx
        .selectFrom("round_element")
        .select("element_id")
        .where("round_id", "=", round.id)
        .where("element_id", "=", input.elementId)
        .executeTakeFirst();
      if (!inRound) return refused("element_not_in_round");
      const code = await ownRatingCode(trx, input.projectId, userId);
      if (!code) return refused("forbidden");
      const values = {
        score: input.score,
        reason: cleanReason(input.reason),
        team_id: teamId,
        updated_at: new Date(),
      };
      await trx
        .insertInto("rating")
        .values({
          round_id: round.id,
          element_id: input.elementId,
          rating_code_id: code,
          ...values,
        })
        .onConflict((oc) =>
          oc.columns(["round_id", "element_id", "rating_code_id"]).doUpdateSet(values),
        )
        .execute();
      // NOTE: Q-PRIV-2. The round is the target, not the element: the log says that someone
      // rated, never what or how.
      await log(trx, userId, input.projectId, "rating_saved", "round", round.id);
      return done(null);
    });
  } catch (error) {
    const refusal = triggerRefusal(error);
    if (refusal) return refused(refusal);
    throw error;
  }
}

/** Removes the rater's rating of one element, while the round is open (DE3, DE14). */
export async function clearRating(
  db: Kysely<DB>,
  userId: string,
  input: RatingInput,
): Promise<RoundResult<null>> {
  return asMember(db, userId, input.projectId, async (trx, role) => {
    if (role === "facilitator" && (await ownGroupId(trx, input.projectId, userId)) === null) {
      return refused("rater_group_required");
    }
    const round = await findRound(trx, input.projectId, input.roundId, "share");
    if (!round || round.opened_at === null) return refused("round_not_found");
    // The trigger guards inserts and updates only, so the open check for a delete is here,
    // against the database clock the trigger uses.
    const open = await trx
      .selectFrom("round")
      .select("id")
      .where("id", "=", round.id)
      .where("closed_at", "is", null)
      .where("closes_at", ">", (eb) => eb.fn<Date>("now"))
      .executeTakeFirst();
    if (!open) return refused("round_not_open");
    const code = await ownRatingCode(trx, input.projectId, userId);
    if (!code) return refused("forbidden");
    await trx
      .deleteFrom("rating")
      .where("round_id", "=", round.id)
      .where("element_id", "=", input.elementId)
      .where("rating_code_id", "=", code)
      .execute();
    await log(trx, userId, input.projectId, "rating_cleared", "round", round.id);
    return done(null);
  });
}

export interface OwnRating {
  /** False when the participant has not answered; then score and reason are null. */
  rated: boolean;
  /** Null with `rated` true is "unable to rate". */
  score: number | null;
  reason: string | null;
}

export interface PreviousRound extends ElementOutcome {
  number: number;
  own: OwnRating;
  /** Every reason given in the previous round, without author, in alphabetical order (DE8). */
  reasons: string[];
}

export interface MyElement {
  id: string;
  name: string;
  description: string;
  own: OwnRating;
  /** The participant's own flags on the element's details, in kind order (DE17). */
  flags: OwnFlag[];
  /** The same element in the previous round, when it was rated there (DE7). */
  previous: PreviousRound | null;
}

export interface MyRatings {
  round: RoundSummary;
  elements: MyElement[];
}

const NOT_RATED: OwnRating = { rated: false, score: null, reason: null };

async function ownRatings(
  db: Kysely<DB>,
  roundId: string,
  code: string | null,
): Promise<Map<string, OwnRating>> {
  if (code === null) return new Map();
  const rows = await db
    .selectFrom("rating")
    .select(["element_id", "score", "reason"])
    .where("round_id", "=", roundId)
    .where("rating_code_id", "=", code)
    .execute();
  return new Map(
    rows.map((row) => [row.element_id, { rated: true, score: row.score, reason: row.reason }]),
  );
}

async function reasonsOf(db: Kysely<DB>, roundId: string): Promise<Map<string, string[]>> {
  const rows = await db
    .selectFrom("rating")
    .select(["element_id", "reason"])
    .where("round_id", "=", roundId)
    .where("reason", "is not", null)
    .orderBy("reason")
    .execute();
  const reasons = new Map<string, string[]>();
  for (const row of rows) {
    if (row.reason === null) continue;
    reasons.set(row.element_id, [...(reasons.get(row.element_id) ?? []), row.reason]);
  }
  return reasons;
}

/**
 * The signed-in member's own ratings in an opened round, and for each element their own rating,
 * their own detail flags (DE17), the group result and the anonymous reasons of the previous round (DE7, DE8).
 */
export async function myRatings(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
  deps: { now: Date },
): Promise<RoundResult<MyRatings>> {
  return asMember(db, userId, input.projectId, async (trx, role) => {
    const round = await findRound(trx, input.projectId, input.roundId);
    if (!round) return refused("round_not_found");
    if (round.opened_at === null) {
      return refused(role === "facilitator" ? "round_not_open" : "round_not_found");
    }
    const code = await ownRatingCode(trx, input.projectId, userId);
    const own = await ownRatings(trx, round.id, code);
    const flags = await ownFlags(trx, round.id, code);
    const previousRound = await trx
      .selectFrom("round")
      .selectAll()
      .where("project_id", "=", input.projectId)
      .where("number", "=", round.number - 1)
      .where("closed_at", "is not", null)
      .executeTakeFirst();
    let previous: ((elementId: string) => PreviousRound | null) | undefined;
    if (previousRound) {
      const rated = new Set(
        (await roundElements(trx, previousRound.id)).map((element) => element.id),
      );
      const outcomes = await outcomesOf(trx, previousRound);
      const ownBefore = await ownRatings(trx, previousRound.id, code);
      const reasons = await reasonsOf(trx, previousRound.id);
      previous = (elementId) =>
        rated.has(elementId)
          ? {
              number: previousRound.number,
              ...(outcomes.get(elementId) ?? emptyOutcome(previousRound)),
              own: ownBefore.get(elementId) ?? NOT_RATED,
              reasons: reasons.get(elementId) ?? [],
            }
          : null;
    }
    const elements = (await roundElements(trx, round.id)).map((element) => ({
      id: element.id,
      name: element.name,
      description: element.description,
      own: own.get(element.id) ?? NOT_RATED,
      flags: flags.get(element.id) ?? [],
      previous: previous?.(element.id) ?? null,
    }));
    return done({ round: summaryOf(round, deps.now), elements });
  });
}

/**
 * Who gave which rating in a round, for the facilitator, only when the round's
 * `facilitator_sees_raters` is true (DE4); otherwise `raters_hidden`.
 */
export async function ratingsByParticipant(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
): Promise<RoundResult<ParticipantRatings[]>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    const round = await findRound(trx, project.id, input.roundId);
    if (!round) return refused("round_not_found");
    if (round.opened_at === null || !round.facilitator_sees_raters) return refused("raters_hidden");
    return done(await ratingsByParticipantQuery(trx, project.id, round.id));
  });
}
