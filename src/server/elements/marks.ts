// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Light marks on the board after the reveal (EL16, ADR 0012): "I support this" and "same as"
// another element. Every member marks in the discover phase once the board is shared. A
// participant reads their own marks only; the facilitator reads counts per element and per pair,
// never who marked (EL2, Q-ANON-1). A mark decides nothing: the Delphi includes or excludes.
import type { Kysely } from "kysely";
import { MARK_PHASE, stepVisible } from "@/lib/phase-access";
import type { DB } from "../db/schema.gen.ts";
import {
  done,
  type LockedProject,
  type ProjectResult,
  phaseOpenFor,
  readProject,
  refused,
} from "../projects/access.ts";
import { actorMemberId } from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import { inPrivateStep } from "./queries.ts";
import type { SameAsInput, SetSupportInput } from "./schemas.ts";

/** Two elements a member marked as the same; the order is the one they chose. */
export interface SameAsPair {
  elementId: string;
  sameAsId: string;
}

/** The signed-in member's own marks on the active elements of the board. */
export interface OwnMarks {
  supported: string[];
  sameAs: SameAsPair[];
}

/** A pair of active elements proposed as duplicates, with the number of members who marked it. */
export interface DuplicateProposal {
  /** The two element ids in board order: the element added first comes first. */
  elementIds: [string, string];
  count: number;
}

/** What the facilitator sees of the marks: counts only, no names (EL16, Q-ANON-1). */
export interface MarkSummary {
  /** The number of supporters per element id; an element without support is left out. */
  support: Record<string, number>;
  /** The proposed duplicates, the most marked first. */
  duplicates: DuplicateProposal[];
}

/**
 * Whether the member may mark the given elements now; the refusal otherwise. A participant before
 * the board's step finds no element (PR9), outside the board's write phase gets `phase_closed`;
 * the facilitator marks in the discover phase only. Before the reveal nobody marks
 * (`marks_before_reveal`, EL13), and a merged or unknown element is `element_not_found`.
 */
async function markRefusal(
  trx: Kysely<DB>,
  project: LockedProject,
  elementIds: readonly string[],
): Promise<ProjectResult<null> | null> {
  if (!stepVisible(project.role, project.phase, "board")) return refused("element_not_found");
  const phaseOpen =
    project.role === "facilitator"
      ? project.phase === MARK_PHASE
      : await phaseOpenFor(trx, project, "element_mark");
  if (!phaseOpen) return refused("phase_closed");
  if (await inPrivateStep(trx, project.id)) return refused("marks_before_reveal");
  const ids = [...new Set(elementIds)];
  const rows = await trx
    .selectFrom("element")
    .select("id")
    .where("project_id", "=", project.id)
    .where("merged_into", "is", null)
    .where("id", "in", ids)
    .execute();
  if (rows.length !== ids.length) return refused("element_not_found");
  return null;
}

/**
 * Sets the member's "I support this" on an element, or takes it back (any member, EL16). Setting
 * it twice keeps one mark.
 */
export async function setSupport(
  db: Kysely<DB>,
  userId: string,
  input: SetSupportInput,
): Promise<ProjectResult<null>> {
  return db.transaction().execute((trx) =>
    readProject(trx, userId, input.projectId, null, async (trx, project) => {
      const refusal = await markRefusal(trx, project, [input.elementId]);
      if (refusal) return refusal;
      const memberId = await actorMemberId(trx, project.id, userId);
      if (input.supported) {
        await trx
          .insertInto("element_support")
          .values({ element_id: input.elementId, member_id: memberId })
          .onConflict((oc) => oc.columns(["element_id", "member_id"]).doNothing())
          .execute();
      } else {
        await trx
          .deleteFrom("element_support")
          .where("element_id", "=", input.elementId)
          .where("member_id", "=", memberId)
          .execute();
      }
      const action = input.supported ? "element_supported" : "element_support_removed";
      await log(trx, userId, project.id, action, "element", input.elementId);
      return done(null);
    }),
  );
}

/**
 * Marks that `elementId` is the same as `sameAsId` (any member, EL16). The pair counts once per
 * member in either order; marking it again changes nothing. An element is never the same as
 * itself (`same_as_itself`).
 */
export async function addSameAs(
  db: Kysely<DB>,
  userId: string,
  input: SameAsInput,
): Promise<ProjectResult<null>> {
  return db.transaction().execute((trx) =>
    readProject(trx, userId, input.projectId, null, async (trx, project) => {
      const ids = [input.elementId, input.sameAsId];
      const refusal = await markRefusal(trx, project, ids);
      if (refusal) return refusal;
      if (input.elementId === input.sameAsId) return refused("same_as_itself");
      const memberId = await actorMemberId(trx, project.id, userId);
      const existing = await sameAsRows(trx, memberId, input);
      if (existing.length === 0) {
        await trx
          .insertInto("element_same_as")
          .values({ element_id: input.elementId, same_as_id: input.sameAsId, member_id: memberId })
          .execute();
      }
      await log(trx, userId, project.id, "element_same_as_added", "element", input.elementId);
      return done(null);
    }),
  );
}

/** Takes back the member's "same as" mark on the pair, in either order (any member, EL16). */
export async function removeSameAs(
  db: Kysely<DB>,
  userId: string,
  input: SameAsInput,
): Promise<ProjectResult<null>> {
  return db.transaction().execute((trx) =>
    readProject(trx, userId, input.projectId, null, async (trx, project) => {
      const ids = [input.elementId, input.sameAsId];
      const refusal = await markRefusal(trx, project, ids);
      if (refusal) return refusal;
      const memberId = await actorMemberId(trx, project.id, userId);
      const rows = await sameAsRows(trx, memberId, input);
      if (rows.length > 0) {
        await trx
          .deleteFrom("element_same_as")
          .where(
            "id",
            "in",
            rows.map((row) => row.id),
          )
          .execute();
      }
      await log(trx, userId, project.id, "element_same_as_removed", "element", input.elementId);
      return done(null);
    }),
  );
}

/** The member's marks on the pair, in either order. */
function sameAsRows(trx: Kysely<DB>, memberId: string, pair: SameAsPair) {
  return trx
    .selectFrom("element_same_as")
    .select("id")
    .where("member_id", "=", memberId)
    .where((eb) =>
      eb.or([
        eb.and([eb("element_id", "=", pair.elementId), eb("same_as_id", "=", pair.sameAsId)]),
        eb.and([eb("element_id", "=", pair.sameAsId), eb("same_as_id", "=", pair.elementId)]),
      ]),
    )
    .execute();
}

/**
 * The signed-in member's own marks on active elements (any member, EL16). The member id is the
 * filter and never part of the answer, so no response carries another member's mark.
 */
export async function listOwnMarks(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<OwnMarks>> {
  return readProject(db, userId, projectId, null, async (db, project) => {
    if (!stepVisible(project.role, project.phase, "board")) {
      return done({ supported: [], sameAs: [] });
    }
    const memberId = await actorMemberId(db, project.id, userId);
    const supported = await db
      .selectFrom("element_support")
      .innerJoin("element", "element.id", "element_support.element_id")
      .select("element_support.element_id")
      .where("element_support.member_id", "=", memberId)
      .where("element.project_id", "=", project.id)
      .where("element.merged_into", "is", null)
      .orderBy("element.created_at")
      .execute();
    const sameAs = await db
      .selectFrom("element_same_as")
      .innerJoin("element as a", "a.id", "element_same_as.element_id")
      .innerJoin("element as b", "b.id", "element_same_as.same_as_id")
      .select(["element_same_as.element_id", "element_same_as.same_as_id"])
      .where("element_same_as.member_id", "=", memberId)
      .where("a.project_id", "=", project.id)
      .where("a.merged_into", "is", null)
      .where("b.merged_into", "is", null)
      .orderBy("element_same_as.created_at")
      .execute();
    return done({
      supported: supported.map((row) => row.element_id),
      sameAs: sameAs.map((row) => ({ elementId: row.element_id, sameAsId: row.same_as_id })),
    });
  });
}

/**
 * The supporters per element and the proposed duplicates per pair, as counts without names
 * (facilitator only, EL16, Q-ANON-1). Only active elements count; a merge ends a proposal.
 */
export async function markSummary(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<MarkSummary>> {
  return readProject(db, userId, projectId, { element: ["read_authors"] }, async (db, project) => {
    const support = await db
      .selectFrom("element_support")
      .innerJoin("element", "element.id", "element_support.element_id")
      .select(["element_support.element_id", (eb) => eb.fn.countAll<string>().as("count")])
      .where("element.project_id", "=", project.id)
      .where("element.merged_into", "is", null)
      .groupBy("element_support.element_id")
      .execute();
    const marks = await db
      .selectFrom("element_same_as")
      .innerJoin("element as a", "a.id", "element_same_as.element_id")
      .innerJoin("element as b", "b.id", "element_same_as.same_as_id")
      .select([
        "a.id as a_id",
        "a.created_at as a_created",
        "b.id as b_id",
        "b.created_at as b_created",
      ])
      .where("a.project_id", "=", project.id)
      .where("a.merged_into", "is", null)
      .where("b.merged_into", "is", null)
      .execute();
    // One entry per unordered pair, its elements in board order (added first, then by id).
    const pairs = new Map<string, DuplicateProposal & { order: string }>();
    for (const mark of marks) {
      const a = `${mark.a_created.toISOString()} ${mark.a_id}`;
      const b = `${mark.b_created.toISOString()} ${mark.b_id}`;
      const elementIds: [string, string] = a < b ? [mark.a_id, mark.b_id] : [mark.b_id, mark.a_id];
      const key = elementIds.join(" ");
      const pair = pairs.get(key);
      if (pair) pair.count += 1;
      else pairs.set(key, { elementIds, count: 1, order: a < b ? `${a} ${b}` : `${b} ${a}` });
    }
    const duplicates = [...pairs.values()]
      .sort((p, q) => q.count - p.count || (p.order < q.order ? -1 : 1))
      .map(({ elementIds, count }) => ({ elementIds, count }));
    return done({
      support: Object.fromEntries(support.map((row) => [row.element_id, Number(row.count)])),
      duplicates,
    });
  });
}
