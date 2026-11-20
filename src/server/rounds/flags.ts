// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Detail flags (DE17): a rater marks the data type, the cardinality or the values of an element
// as wrong while the round is open, one flag per detail, with a reason. The rating covers
// inclusion only (DE1); the flags go to the later detail step. A flag carries the rating code
// only (ADR 0005): who flagged what shows only through rater-link.ts, when the round lets the
// facilitator see the raters (DE4). Other participants never see a flag.
import type { Kysely } from "kysely";
import type { DB } from "../db/schema.gen.ts";
import { log, ownGroupId } from "../projects/queries.ts";
import { asFacilitator, asMember, done, type RoundResult, refused } from "./access.ts";
import { ownRatingCode } from "./rater-link.ts";
import { findRound } from "./round.ts";
import {
  DETAIL_FLAG_KINDS,
  type DetailFlagInput,
  type DetailFlagKind,
  type RoundInput,
  type SaveDetailFlagInput,
} from "./schemas.ts";

/** The refusals of the detail_flag_in_open_round trigger (migration 0009), by their message. */
const TRIGGER_REFUSALS = { detail_flag_round_not_open: "round_not_open" } as const;

function triggerRefusal(error: unknown) {
  if (!(error instanceof Error)) return undefined;
  return Object.entries(TRIGGER_REFUSALS).find(([message]) => error.message === message)?.[1];
}

function isKind(value: string): value is DetailFlagKind {
  return (DETAIL_FLAG_KINDS as readonly string[]).includes(value);
}

/** A flag as the rater who set it sees it. */
export interface OwnFlag {
  kind: DetailFlagKind;
  reason: string;
}

/** A flag as the facilitator sees it: never who set it. */
export interface RoundFlag extends OwnFlag {
  id: string;
}

/** The flags on one element of a round, for the facilitator. */
export interface ElementFlags {
  elementId: string;
  counts: Record<DetailFlagKind, number>;
  /** By detail kind, then by reason, so the order says nothing about who flagged first. */
  flags: RoundFlag[];
}

/**
 * The checks every flag action shares: a rater (a facilitator only from a stakeholder group,
 * DE14), an opened round of the project with the element in it, and the rater's code.
 */
async function flaggerContext(
  trx: Kysely<DB>,
  userId: string,
  input: DetailFlagInput,
  role: string,
): Promise<RoundResult<{ roundId: string; code: string }>> {
  if (role === "facilitator" && (await ownGroupId(trx, input.projectId, userId)) === null) {
    return refused("rater_group_required");
  }
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
  return done({ roundId: round.id, code });
}

/**
 * Sets or changes the rater's flag on one detail of an element (DE17). The database takes it
 * only while the round is open; its refusal comes back as `round_not_open`.
 */
export async function saveDetailFlag(
  db: Kysely<DB>,
  userId: string,
  input: SaveDetailFlagInput,
): Promise<RoundResult<null>> {
  try {
    return await asMember(db, userId, input.projectId, async (trx, role) => {
      const context = await flaggerContext(trx, userId, input, role);
      if (!context.ok) return context;
      const values = { reason: input.reason.trim(), updated_at: new Date() };
      await trx
        .insertInto("detail_flag")
        .values({
          round_id: context.value.roundId,
          element_id: input.elementId,
          rating_code_id: context.value.code,
          kind: input.kind,
          ...values,
        })
        .onConflict((oc) =>
          oc.columns(["round_id", "element_id", "rating_code_id", "kind"]).doUpdateSet(values),
        )
        .execute();
      // NOTE: Q-PRIV-2. The round is the target: the log says that someone flagged, not what.
      await log(trx, userId, input.projectId, "detail_flag_saved", "round", context.value.roundId);
      return done(null);
    });
  } catch (error) {
    const refusal = triggerRefusal(error);
    if (refusal) return refused(refusal);
    throw error;
  }
}

/** Removes the rater's flag on one detail of an element while the round is open (DE17). */
export async function removeDetailFlag(
  db: Kysely<DB>,
  userId: string,
  input: DetailFlagInput,
): Promise<RoundResult<null>> {
  return asMember(db, userId, input.projectId, async (trx, role) => {
    const context = await flaggerContext(trx, userId, input, role);
    if (!context.ok) return context;
    // The trigger guards inserts and updates only, so the open check for a delete is here,
    // against the database clock the trigger uses.
    const open = await trx
      .selectFrom("round")
      .select("id")
      .where("id", "=", context.value.roundId)
      .where("closed_at", "is", null)
      .where("closes_at", ">", (eb) => eb.fn<Date>("now"))
      .executeTakeFirst();
    if (!open) return refused("round_not_open");
    await trx
      .deleteFrom("detail_flag")
      .where("round_id", "=", context.value.roundId)
      .where("element_id", "=", input.elementId)
      .where("rating_code_id", "=", context.value.code)
      .where("kind", "=", input.kind)
      .execute();
    await log(trx, userId, input.projectId, "detail_flag_removed", "round", context.value.roundId);
    return done(null);
  });
}

/** The rater's own flags in a round by element; empty without a code. */
export async function ownFlags(
  db: Kysely<DB>,
  roundId: string,
  code: string | null,
): Promise<Map<string, OwnFlag[]>> {
  const flags = new Map<string, OwnFlag[]>();
  if (code === null) return flags;
  const rows = await db
    .selectFrom("detail_flag")
    .select(["element_id", "kind", "reason"])
    .where("round_id", "=", roundId)
    .where("rating_code_id", "=", code)
    .execute();
  for (const row of rows) {
    if (!isKind(row.kind)) continue;
    const flag = { kind: row.kind, reason: row.reason };
    flags.set(row.element_id, [...(flags.get(row.element_id) ?? []), flag]);
  }
  for (const list of flags.values()) {
    list.sort((a, b) => DETAIL_FLAG_KINDS.indexOf(a.kind) - DETAIL_FLAG_KINDS.indexOf(b.kind));
  }
  return flags;
}

/**
 * Every flag of a round for the facilitator, per flagged element, with the count per detail and
 * the reasons, never who gave them (DE17, ADR 0005).
 */
export async function roundFlags(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
): Promise<RoundResult<ElementFlags[]>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    const round = await findRound(trx, project.id, input.roundId);
    if (!round) return refused("round_not_found");
    const rows = await trx
      .selectFrom("detail_flag")
      .select(["id", "element_id", "kind", "reason"])
      .where("round_id", "=", round.id)
      .orderBy("element_id")
      .orderBy((eb) => eb.fn("lower", ["reason"]))
      .orderBy("id")
      .execute();
    const byElement = new Map<string, ElementFlags>();
    for (const row of rows) {
      if (!isKind(row.kind)) continue;
      let element = byElement.get(row.element_id);
      if (!element) {
        element = {
          elementId: row.element_id,
          counts: { data_type: 0, cardinality: 0, values: 0 },
          flags: [],
        };
        byElement.set(row.element_id, element);
      }
      element.counts[row.kind] += 1;
      element.flags.push({ id: row.id, kind: row.kind, reason: row.reason });
    }
    for (const element of byElement.values()) {
      // A stable sort keeps the reason order of the query within each kind.
      element.flags.sort(
        (a, b) => DETAIL_FLAG_KINDS.indexOf(a.kind) - DETAIL_FLAG_KINDS.indexOf(b.kind),
      );
    }
    return done([...byElement.values()]);
  });
}
