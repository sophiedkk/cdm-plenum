// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Consent rounds of a Team project (DE20, ADR 0023): answering Include, Leave out, Discuss or
// "Unable to judge" per element, the answers by name once the round has closed, and the
// facilitator settling an element that ended on "To discuss". A Delphi round never reaches this
// file's writes: the answer and the settle refuse it with `team_round_only`.
import type { Kysely } from "kysely";
import type { Outcome } from "@/lib/consensus";
import {
  type ConsentAnswer,
  type ConsentCounts,
  consentCounts,
  consentNeedsReason,
  isConsentAnswer,
} from "@/lib/consent";
import { groupOrder } from "@/lib/element-groups";
import type { DB } from "../db/schema.gen.ts";
import { log } from "../projects/queries.ts";
import { asFacilitator, asMember, done, type RoundResult, refused } from "./access.ts";
import { inGroupOrder, itemGroupsOf } from "./groups.ts";
import { raterContext } from "./rater-context.ts";
import type { MyRatings, OwnRating, PreviousRound } from "./ratings.ts";
import {
  findRound,
  modeOf,
  type RoundRow,
  type RoundSummary,
  roundElements,
  roundItems,
} from "./round.ts";
import type { ConsentInput, SaveConsentInput, SettleInput } from "./schemas.ts";

/** One member's answer, with the name every member sees once the round has closed (ADR 0023). */
export interface NamedAnswer {
  name: string;
  answer: ConsentAnswer;
  /** Null for "Unable to judge", and for an Include without a reason. */
  reason: string | null;
}

/** An element's answers in a closed round: the counts, each answer by name, and its settling. */
export interface ConsentResult {
  counts: ConsentCounts;
  answers: NamedAnswer[];
  /** Set when the facilitator settled an element that was "To discuss". */
  settled: { note: string; at: string } | null;
}

/** The previous round of an element in a Team round (DE20): how it ended, and who answered what. */
export interface PreviousConsent {
  number: number;
  outcome: Outcome;
  answers: NamedAnswer[];
}

/** The refusals of the consent_answer_in_open_round trigger (migration 0029), by message. */
const TRIGGER_REFUSALS = {
  consent_round_not_open: "round_not_open",
  consent_project_not_team: "team_round_only",
} as const;

function triggerRefusal(error: unknown) {
  if (!(error instanceof Error)) return undefined;
  return Object.entries(TRIGGER_REFUSALS).find(([message]) => error.message === message)?.[1];
}

function cleanReason(reason: string | undefined): string | null {
  const trimmed = reason?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
}

/** The member row of the user in the project; it names the answer. */
async function ownMemberId(
  trx: Kysely<DB>,
  projectId: string,
  userId: string,
): Promise<string | null> {
  const row = await trx
    .selectFrom("member")
    .select("id")
    .where("organizationId", "=", projectId)
    .where("userId", "=", userId)
    .executeTakeFirst();
  return row?.id ?? null;
}

/**
 * Saves or changes the member's answer to one element of an open Team round (DE20). Leave out
 * and Discuss need a reason (`consent_reason_required`); Unable to judge keeps none. The
 * database accepts it only while the round is open. A facilitator answers from their own
 * stakeholder group, as for a rating (DE14).
 */
export async function saveConsent(
  db: Kysely<DB>,
  userId: string,
  input: SaveConsentInput,
): Promise<RoundResult<null>> {
  try {
    return await asMember(db, userId, input.projectId, async (trx, role, _visible, phase) => {
      if ((await modeOf(trx, input.projectId)) !== "team") return refused("team_round_only");
      const context = await raterContext(
        trx,
        userId,
        input,
        { kind: "elements", elementId: input.elementId },
        role,
        phase,
      );
      if (!context.ok) return context;
      const { roundId, teamId } = context.value;
      const reason = input.answer === "abstain" ? null : cleanReason(input.reason);
      if (consentNeedsReason(input.answer) && reason === null) {
        return refused("consent_reason_required");
      }
      const memberId = await ownMemberId(trx, input.projectId, userId);
      if (!memberId) return refused("forbidden");
      const values = {
        answer: input.answer,
        reason,
        team_id: teamId,
        updated_at: new Date(),
      };
      await trx
        .insertInto("consent_answer")
        .values({ round_id: roundId, element_id: input.elementId, member_id: memberId, ...values })
        .onConflict((oc) => oc.columns(["round_id", "element_id", "member_id"]).doUpdateSet(values))
        .execute();
      // NOTE: Q-PRIV-2. The round is the target, not the element: the log says that someone
      // answered, never what.
      await log(trx, userId, input.projectId, "consent_saved", "round", roundId);
      return done(null);
    });
  } catch (error) {
    const refusal = triggerRefusal(error);
    if (refusal) return refused(refusal);
    throw error;
  }
}

/** Removes the member's answer to one element, while the round is open. */
export async function clearConsent(
  db: Kysely<DB>,
  userId: string,
  input: ConsentInput,
): Promise<RoundResult<null>> {
  return asMember(db, userId, input.projectId, async (trx, role, _visible, phase) => {
    if ((await modeOf(trx, input.projectId)) !== "team") return refused("team_round_only");
    const context = await raterContext(
      trx,
      userId,
      input,
      { kind: "elements", elementId: input.elementId },
      role,
      phase,
    );
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
    const memberId = await ownMemberId(trx, input.projectId, userId);
    if (!memberId) return refused("forbidden");
    await trx
      .deleteFrom("consent_answer")
      .where("round_id", "=", roundId)
      .where("element_id", "=", input.elementId)
      .where("member_id", "=", memberId)
      .execute();
    await log(trx, userId, input.projectId, "consent_cleared", "round", roundId);
    return done(null);
  });
}

/** Every answer of a round per element, without names; the closing counts them (DE20). */
export async function answersOf(
  trx: Kysely<DB>,
  roundId: string,
): Promise<Map<string, ConsentAnswer[]>> {
  const rows = await trx
    .selectFrom("consent_answer")
    .select(["element_id", "answer"])
    .where("round_id", "=", roundId)
    .execute();
  const answers = new Map<string, ConsentAnswer[]>();
  for (const row of rows) {
    if (!isConsentAnswer(row.answer)) continue;
    answers.set(row.element_id, [...(answers.get(row.element_id) ?? []), row.answer]);
  }
  return answers;
}

/**
 * Every answer of a round per element with the name of its member, by name and then by member
 * id. Only a closed round's answers are read this way (ADR 0023).
 */
export async function namedAnswersOf(
  trx: Kysely<DB>,
  roundId: string,
): Promise<Map<string, NamedAnswer[]>> {
  const rows = await trx
    .selectFrom("consent_answer")
    .innerJoin("member", "member.id", "consent_answer.member_id")
    .innerJoin("user", "user.id", "member.userId")
    .select([
      "consent_answer.element_id",
      "consent_answer.member_id",
      "consent_answer.answer",
      "consent_answer.reason",
      "user.name",
      "user.email",
    ])
    .where("consent_answer.round_id", "=", roundId)
    .execute();
  const sorted = rows
    .map((row) => ({ ...row, shown: row.name.trim() || row.email }))
    .sort((a, b) => a.shown.localeCompare(b.shown) || a.member_id.localeCompare(b.member_id));
  const answers = new Map<string, NamedAnswer[]>();
  for (const row of sorted) {
    if (!isConsentAnswer(row.answer)) continue;
    const named = { name: row.shown, answer: row.answer, reason: row.reason };
    answers.set(row.element_id, [...(answers.get(row.element_id) ?? []), named]);
  }
  return answers;
}

/** The result of every element of a closed Team round: counts, answers by name, settling. */
export async function consentResultsOf(
  trx: Kysely<DB>,
  roundId: string,
): Promise<Map<string, ConsentResult>> {
  const named = await namedAnswersOf(trx, roundId);
  const settled = await trx
    .selectFrom("round_element")
    .select(["element_id", "settled_at", "settled_note"])
    .where("round_id", "=", roundId)
    .where("settled_at", "is not", null)
    .execute();
  const settling = new Map(
    settled.flatMap((row) =>
      row.settled_at && row.settled_note
        ? [[row.element_id, { note: row.settled_note, at: row.settled_at.toISOString() }] as const]
        : [],
    ),
  );
  const results = new Map<string, ConsentResult>();
  const elementIds = new Set([...named.keys(), ...settling.keys()]);
  for (const elementId of elementIds) {
    const answers = named.get(elementId) ?? [];
    results.set(elementId, {
      counts: consentCounts(answers.map((row) => row.answer)),
      answers,
      settled: settling.get(elementId) ?? null,
    });
  }
  return results;
}

/** An element nobody answered: no counts and no settling. */
export function emptyConsent(): ConsentResult {
  return { counts: consentCounts([]), answers: [], settled: null };
}

/**
 * Settles an element that a closed Team round left on "To discuss" (DE20): the facilitator
 * decides it in or out after the discussion and writes a short note. The outcome then reads
 * as `included` or `excluded` everywhere a round outcome is read.
 */
export async function settleElement(
  db: Kysely<DB>,
  userId: string,
  input: SettleInput,
  deps: { now: Date },
): Promise<RoundResult<null>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    if ((await modeOf(trx, project.id)) !== "team") return refused("team_round_only");
    const round = await findRound(trx, project.id, input.roundId, "update");
    if (!round) return refused("round_not_found");
    if (round.closed_at === null) return refused("round_not_closed");
    const item = await trx
      .selectFrom("round_element")
      .select(["outcome", "settled_at"])
      .where("round_id", "=", round.id)
      .where("element_id", "=", input.elementId)
      .forUpdate()
      .executeTakeFirst();
    if (!item) return refused("element_not_in_round");
    if (item.outcome !== "no_consensus" || item.settled_at !== null) {
      return refused("element_not_to_discuss");
    }
    const note = input.note.trim();
    if (note === "") return refused("settle_note_required");
    await trx
      .updateTable("round_element")
      .set({ outcome: input.outcome, settled_at: deps.now, settled_note: note })
      .where("round_id", "=", round.id)
      .where("element_id", "=", input.elementId)
      .execute();
    await log(trx, userId, project.id, "element_settled", "round", round.id);
    return done(null);
  });
}

/**
 * The signed-in member's own answers in an opened Team round, with the answers of the previous
 * closed round by name next to each element (DE20, ADR 0023). The Delphi parts of a card (flags,
 * distribution, anonymous reasons) stay empty.
 */
export async function teamRatings(
  trx: Kysely<DB>,
  round: RoundRow,
  userId: string,
  summary: RoundSummary,
): Promise<MyRatings> {
  const memberId = await ownMemberId(trx, round.project_id, userId);
  const ownRows =
    memberId === null
      ? []
      : await trx
          .selectFrom("consent_answer")
          .select(["element_id", "answer", "reason"])
          .where("round_id", "=", round.id)
          .where("member_id", "=", memberId)
          .execute();
  const own = new Map<string, OwnRating>(
    ownRows.flatMap((row) =>
      isConsentAnswer(row.answer)
        ? [
            [
              row.element_id,
              { rated: true, score: null, reason: row.reason, answer: row.answer },
            ] as const,
          ]
        : [],
    ),
  );
  const previousRound = await trx
    .selectFrom("round")
    .selectAll()
    .where("project_id", "=", round.project_id)
    .where("kind", "=", "elements")
    .where("number", "<", round.number)
    .where("closed_at", "is not", null)
    .orderBy("number", "desc")
    .limit(1)
    .executeTakeFirst();
  let previous: ((elementId: string) => PreviousConsent | null) | undefined;
  if (previousRound) {
    const items = new Map(
      (await roundElements(trx, previousRound.id)).map((element) => [element.id, element]),
    );
    const answers = await namedAnswersOf(trx, previousRound.id);
    previous = (elementId) => {
      const item = items.get(elementId);
      if (!item) return null;
      return {
        number: previousRound.number,
        outcome: item.outcome ?? "no_consensus",
        answers: answers.get(elementId) ?? [],
      };
    };
  }
  const rows = await roundItems(trx, round);
  const groupOf = await itemGroupsOf(trx, rows);
  const elements = rows.map((element) => ({
    id: element.id,
    name: element.name,
    description: element.description,
    reference: element.reference,
    group: groupOf.get(element.id) ?? null,
    own: own.get(element.id) ?? { rated: false, score: null, reason: null, answer: null },
    flags: [],
    previous: null as PreviousRound | null,
    previousConsent: previous?.(element.id) ?? null,
  }));
  return {
    round: summary,
    elements: inGroupOrder(elements, (ids) => groupOrder(ids, `${memberId ?? userId}:${round.id}`)),
  };
}

/** The members who answered each element of a round, for the response rate (DE6). */
export async function answeredCounts(
  trx: Kysely<DB>,
  roundId: string,
): Promise<{ team_id: string | null; answered: string }[]> {
  return trx
    .selectFrom("consent_answer")
    .select((eb) => [
      eb.fn.max("team_id").as("team_id"),
      eb.fn.count<string>("element_id").as("answered"),
    ])
    .where("round_id", "=", roundId)
    .groupBy("member_id")
    .execute();
}

/** How many elements of an open Team round the user answered; the home counts them (PR8). */
export async function ownAnswerCount(
  trx: Kysely<DB>,
  round: Pick<RoundRow, "id" | "project_id">,
  userId: string,
): Promise<number> {
  const memberId = await ownMemberId(trx, round.project_id, userId);
  if (memberId === null) return 0;
  const row = await trx
    .selectFrom("consent_answer")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("round_id", "=", round.id)
    .where("member_id", "=", memberId)
    .executeTakeFirst();
  return Number(row?.count ?? 0);
}

/** How many members answered every one of `elements` elements of an open Team round. */
export async function completedMemberCount(
  trx: Kysely<DB>,
  roundId: string,
  elements: number,
): Promise<number> {
  if (elements === 0) return 0;
  const rows = await trx
    .selectFrom("consent_answer")
    .select("member_id")
    .where("round_id", "=", roundId)
    .groupBy("member_id")
    .having((eb) => eb.fn.countAll(), ">=", elements)
    .execute();
  return rows.length;
}
