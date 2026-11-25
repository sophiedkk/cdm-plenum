// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Rating in an open round (DE3), a participant's own ratings with the previous round next to
// them (DE7, DE8), and the facilitator's view by participant when the round allows it (DE4).
// Ratings carry the rating code only; rater-link.ts is the one place that resolves it (ADR 0005).
import type { Kysely } from "kysely";
import type { ConsentAnswer } from "@/lib/consent";
import { groupOrder } from "@/lib/element-groups";
import type { ElementReference } from "@/lib/elements";
import type { DB } from "../db/schema.gen.ts";
import { log } from "../projects/queries.ts";
import { asFacilitator, asMember, done, type RoundResult, refused } from "./access.ts";
import { type PreviousConsent, teamRatings } from "./consent.ts";
import { type OwnFlag, ownFlags } from "./flags.ts";
import { inGroupOrder, itemGroupsOf, type RoundGroup } from "./groups.ts";
import { type RatedItem, raterContext } from "./rater-context.ts";
import { ownRatingCode, type ParticipantRatings, ratingsByParticipantQuery } from "./rater-link.ts";
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
  roundElements,
  roundItems,
  summaryOf,
} from "./round.ts";
import type {
  RatingInput,
  RoundInput,
  SaveRatingInput,
  SaveValueRatingInput,
  ValueRatingInput,
} from "./schemas.ts";

/** The refusals of the rating_in_open_round trigger (migration 0002), by their message. */
const TRIGGER_REFUSALS = {
  rating_round_not_open: "round_not_open",
  rating_score_out_of_scale: "score_out_of_scale",
  rating_project_team: "delphi_round_only",
} as const;

function triggerRefusal(error: unknown) {
  if (!(error instanceof Error)) return undefined;
  return Object.entries(TRIGGER_REFUSALS).find(([message]) => error.message === message)?.[1];
}

function cleanReason(reason: string | undefined): string | null {
  const trimmed = reason?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

async function saveScore(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput & { score: number | null; reason?: string | undefined },
  item: RatedItem,
): Promise<RoundResult<null>> {
  try {
    return await asMember(db, userId, input.projectId, async (trx, role, _visible, phase) => {
      if (item.kind === "elements" && (await modeOf(trx, input.projectId)) === "team") {
        return refused("delphi_round_only");
      }
      const context = await raterContext(trx, userId, input, item, role, phase);
      if (!context.ok) return context;
      const { roundId, teamId } = context.value;
      const code = await ownRatingCode(trx, input.projectId, userId);
      if (!code) return refused("forbidden");
      const values = {
        score: input.score,
        reason: cleanReason(input.reason),
        team_id: teamId,
        updated_at: new Date(),
      };
      const key = { round_id: roundId, rating_code_id: code };
      if (item.kind === "values") {
        await trx
          .insertInto("value_rating")
          .values({ ...key, value_id: item.valueId, ...values })
          .onConflict((oc) =>
            oc.columns(["round_id", "value_id", "rating_code_id"]).doUpdateSet(values),
          )
          .execute();
      } else {
        await trx
          .insertInto("rating")
          .values({ ...key, element_id: item.elementId, ...values })
          .onConflict((oc) =>
            oc.columns(["round_id", "element_id", "rating_code_id"]).doUpdateSet(values),
          )
          .execute();
      }
      // NOTE: Q-PRIV-2. The round is the target, not the element: the log says that someone
      // rated, never what or how.
      await log(trx, userId, input.projectId, "rating_saved", "round", roundId);
      return done(null);
    });
  } catch (error) {
    const refusal = triggerRefusal(error);
    if (refusal) return refused(refusal);
    throw error;
  }
}

async function clearScore(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
  item: RatedItem,
): Promise<RoundResult<null>> {
  return asMember(db, userId, input.projectId, async (trx, role, _visible, phase) => {
    if (item.kind === "elements" && (await modeOf(trx, input.projectId)) === "team") {
      return refused("delphi_round_only");
    }
    const context = await raterContext(trx, userId, input, item, role, phase);
    if (!context.ok) return context;
    const { roundId } = context.value;
    // The trigger guards inserts and updates only, so the open check for a delete is here,
    // against the database clock the trigger uses.
    const open = await trx
      .selectFrom("round")
      .select("id")
      .where("id", "=", roundId)
      .where("closed_at", "is", null)
      .where("closes_at", ">", (eb) => eb.fn<Date>("now"))
      .executeTakeFirst();
    if (!open) return refused("round_not_open");
    const code = await ownRatingCode(trx, input.projectId, userId);
    if (!code) return refused("forbidden");
    if (item.kind === "values") {
      await trx
        .deleteFrom("value_rating")
        .where("round_id", "=", roundId)
        .where("value_id", "=", item.valueId)
        .where("rating_code_id", "=", code)
        .execute();
    } else {
      await trx
        .deleteFrom("rating")
        .where("round_id", "=", roundId)
        .where("element_id", "=", item.elementId)
        .where("rating_code_id", "=", code)
        .execute();
    }
    await log(trx, userId, input.projectId, "rating_cleared", "round", roundId);
    return done(null);
  });
}

/**
 * Saves or changes the rater's rating of one element (DE3); a null score is "unable to rate".
 * The database accepts it only while the round is open and the score is on its scale; its
 * refusals come back as `round_not_open` and `score_out_of_scale`.
 */
export async function saveRating(
  db: Kysely<DB>,
  userId: string,
  input: SaveRatingInput,
): Promise<RoundResult<null>> {
  return saveScore(db, userId, input, { kind: "elements", elementId: input.elementId });
}

/** Removes the rater's rating of one element, while the round is open (DE3, DE14). */
export async function clearRating(
  db: Kysely<DB>,
  userId: string,
  input: RatingInput,
): Promise<RoundResult<null>> {
  return clearScore(db, userId, input, { kind: "elements", elementId: input.elementId });
}

/** Saves or changes the rater's rating of one value of a value round (DT3), as `saveRating`. */
export async function saveValueRating(
  db: Kysely<DB>,
  userId: string,
  input: SaveValueRatingInput,
): Promise<RoundResult<null>> {
  return saveScore(db, userId, input, { kind: "values", valueId: input.valueId });
}

/** Removes the rater's rating of one value of a value round (DT3), as `clearRating`. */
export async function clearValueRating(
  db: Kysely<DB>,
  userId: string,
  input: ValueRatingInput,
): Promise<RoundResult<null>> {
  return clearScore(db, userId, input, { kind: "values", valueId: input.valueId });
}

export interface OwnRating {
  /** False when the participant has not answered; then score and reason are null. */
  rated: boolean;
  /** Null with `rated` true is "unable to rate". */
  score: number | null;
  reason: string | null;
  /** The consent answer of a Team round (DE20); left out in a Delphi round. */
  answer?: ConsentAnswer | null;
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
  /** The model a reference element refers to (EL26); the rating question stays the same. */
  reference: ElementReference | null;
  /** The element's group; null for an element without one, listed after the groups. */
  group: RoundGroup | null;
  own: OwnRating;
  /** The participant's own flags on the element's details, in kind order (DE17). */
  flags: OwnFlag[];
  /** The same element in the previous round, when it was rated there (DE7). */
  previous: PreviousRound | null;
  /** In a value round (DT3) the item is a value: its number and the element it belongs to. */
  value?: RoundValueOf;
  /** In a Team round (DE20): the answers of the previous round, by name. */
  previousConsent?: PreviousConsent | null;
}

export interface MyRatings {
  round: RoundSummary;
  elements: MyElement[];
}

const NOT_RATED: OwnRating = { rated: false, score: null, reason: null };

async function ownRatings(
  db: Kysely<DB>,
  round: Pick<RoundRow, "id" | "kind">,
  code: string | null,
): Promise<Map<string, OwnRating>> {
  if (code === null) return new Map();
  const rows =
    kindOf(round) === "values"
      ? await db
          .selectFrom("value_rating")
          .select(["value_id as item_id", "score", "reason"])
          .where("round_id", "=", round.id)
          .where("rating_code_id", "=", code)
          .execute()
      : await db
          .selectFrom("rating")
          .select(["element_id as item_id", "score", "reason"])
          .where("round_id", "=", round.id)
          .where("rating_code_id", "=", code)
          .execute();
  return new Map(
    rows.map((row) => [row.item_id, { rated: true, score: row.score, reason: row.reason }]),
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
 * In a value round (DT3) the items are values under their element's name; it has no previous
 * round and no flags.
 */
export async function myRatings(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
  deps: { now: Date },
): Promise<RoundResult<MyRatings>> {
  return asMember(db, userId, input.projectId, async (trx, role, roundsVisible) => {
    const round = await findRound(trx, input.projectId, input.roundId);
    if (!round || !roundsVisible) return refused("round_not_found");
    if (round.opened_at === null) {
      return refused(role === "facilitator" ? "round_not_open" : "round_not_found");
    }
    const mode = await modeOf(trx, input.projectId);
    if (mode === "team" && kindOf(round) === "elements") {
      return done(await teamRatings(trx, round, userId, summaryOf(round, deps.now, mode)));
    }
    const code = await ownRatingCode(trx, input.projectId, userId);
    const own = await ownRatings(trx, round, code);
    const flags = await ownFlags(trx, round.id, code);
    const previousRound =
      kindOf(round) === "values"
        ? undefined
        : await trx
            .selectFrom("round")
            .selectAll()
            .where("project_id", "=", input.projectId)
            .where("kind", "=", "elements")
            .where("number", "<", round.number)
            .orderBy("number", "desc")
            .limit(1)
            .where("closed_at", "is not", null)
            .executeTakeFirst();
    let previous: ((elementId: string) => PreviousRound | null) | undefined;
    if (previousRound) {
      const rated = new Set(
        (await roundElements(trx, previousRound.id)).map((element) => element.id),
      );
      const outcomes = await outcomesOf(trx, previousRound);
      const ownBefore = await ownRatings(trx, previousRound, code);
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
    const rows = await roundItems(trx, round);
    const groupOf = await itemGroupsOf(trx, rows);
    const elements = rows.map((element) => ({
      id: element.id,
      name: element.name,
      description: element.description,
      reference: element.reference,
      group: groupOf.get(element.id) ?? null,
      own: own.get(element.id) ?? NOT_RATED,
      flags: flags.get(element.id) ?? [],
      previous: previous?.(element.id) ?? null,
      ...(element.value ? { value: element.value } : {}),
    }));
    // NOTE: DE19. The groups come in an order of the rater's own, the same all round long: the
    // seed is the rating code, or the user for a member without one yet, and the round.
    return done({
      round: summaryOf(round, deps.now, mode),
      elements: inGroupOrder(elements, (ids) => groupOrder(ids, `${code ?? userId}:${round.id}`)),
    });
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
    if ((await modeOf(trx, project.id)) === "team") return refused("delphi_round_only");
    if (round.opened_at === null || !round.facilitator_sees_raters) return refused("raters_hidden");
    return done(await ratingsByParticipantQuery(trx, project.id, round.id));
  });
}
