// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The first look at the elements from existing models (EL22, ADR 0020): each member goes through
// them one at a time and answers whether the element belongs to the concept. A member reads and
// writes only their own answers; the facilitator reads counts, never who answered what (EL2).
import type { Kysely } from "kysely";
import { type FirstLookAnswer, type FirstLookCounts, isFirstLookAnswer } from "@/lib/first-look";
import { SOURCE_PHASE, stepVisible } from "@/lib/phase-access";
import type { DB } from "../db/schema.gen.ts";
import {
  done,
  lockProject,
  type ProjectResult,
  phaseOpenFor,
  readProject,
  refused,
} from "../projects/access.ts";
import { actorMemberId } from "../projects/member.ts";
import type { SourceModelKind } from "../sources/queries.ts";
import type { FirstLookAnswerInput } from "./schemas.ts";

type Db = Kysely<DB>;

/** A model an element is found in, as the first look names it. */
export interface FoundIn {
  kind: SourceModelKind;
  title: string;
}

/** One element of the first look with the reader's own answer. */
export interface FirstLookElement {
  id: string;
  name: string;
  description: string;
  foundIn: FoundIn[];
  /** The reader's answer; null before they answer. */
  answer: FirstLookAnswer | null;
}

export interface FirstLook {
  /** The project's name: the concept the question asks about. */
  concept: string;
  elements: FirstLookElement[];
}

/**
 * The elements on the list that came from existing models (EL7): active, linked to at least one
 * source element, in the order they were added, each with the models it is found in.
 */
export async function lookElements(
  db: Db,
  projectId: string,
): Promise<{ id: string; name: string; description: string; foundIn: FoundIn[] }[]> {
  const rows = await db
    .selectFrom("element")
    .innerJoin("element_source_link as link", "link.element_id", "element.id")
    .innerJoin("source_element", "source_element.id", "link.source_element_id")
    .innerJoin("source_model", "source_model.id", "source_element.source_model_id")
    .select([
      "element.id",
      "element.name",
      "element.description",
      "element.created_at",
      "source_model.id as model_id",
      "source_model.kind",
      "source_model.title",
      "source_model.created_at as model_created_at",
    ])
    .where("element.project_id", "=", projectId)
    .where("element.merged_into", "is", null)
    .orderBy("element.created_at")
    .orderBy("element.id")
    .orderBy("source_model.created_at")
    .orderBy("source_model.id")
    .execute();
  const byId = new Map<
    string,
    { id: string; name: string; description: string; foundIn: FoundIn[]; models: Set<string> }
  >();
  for (const row of rows) {
    let entry = byId.get(row.id);
    if (!entry) {
      entry = {
        id: row.id,
        name: row.name,
        description: row.description,
        foundIn: [],
        models: new Set(),
      };
      byId.set(row.id, entry);
    }
    if (!entry.models.has(row.model_id)) {
      entry.models.add(row.model_id);
      entry.foundIn.push({ kind: row.kind as SourceModelKind, title: row.title });
    }
  }
  return [...byId.values()].map(({ models: _models, ...element }) => element);
}

/**
 * The first look for the signed-in member (EL22): the elements from existing models with their
 * own answers only. Refused with `phase_closed` while the phase hides the step from a participant.
 */
export async function firstLook(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectResult<FirstLook>> {
  return readProject(db, userId, projectId, null, async (reader, project) => {
    if (!stepVisible(project.role, project.phase, "first_look")) return refused("phase_closed");
    const me = await actorMemberId(reader, project.id, userId);
    const elements = await lookElements(reader, project.id);
    const answers = await reader
      .selectFrom("first_look_answer")
      .innerJoin("element", "element.id", "first_look_answer.element_id")
      .select(["first_look_answer.element_id", "first_look_answer.answer"])
      .where("element.project_id", "=", project.id)
      .where("first_look_answer.member_id", "=", me)
      .execute();
    const answerOf = new Map(answers.map((row) => [row.element_id, row.answer]));
    return done({
      concept: project.name,
      elements: elements.map((element) => {
        const answer = answerOf.get(element.id);
        return { ...element, answer: isFirstLookAnswer(answer) ? answer : null };
      }),
    });
  });
}

/**
 * Saves the member's answer to one element (EL22), replacing an earlier one, while the phase
 * opens the first look. Refused with `phase_closed` outside discover and with
 * `element_not_found` for an element that is not on the list from an existing model.
 */
export async function answerFirstLook(
  db: Db,
  userId: string,
  input: FirstLookAnswerInput,
): Promise<ProjectResult<null>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, input.projectId, userId);
    if (!project) return refused("not_found");
    // NOTE: EL22. The first look belongs to discover for everyone: the facilitator too, who
    // otherwise prepares ahead (PR10), answers nothing once the Delphi has started.
    if (project.phase !== SOURCE_PHASE) return refused("phase_closed");
    if (!(await phaseOpenFor(trx, project, "first_look_answer"))) return refused("phase_closed");
    const element = await trx
      .selectFrom("element")
      .innerJoin("element_source_link as link", "link.element_id", "element.id")
      .select("element.id")
      .where("element.id", "=", input.elementId)
      .where("element.project_id", "=", project.id)
      .where("element.merged_into", "is", null)
      .executeTakeFirst();
    if (!element) return refused("element_not_found");
    const me = await actorMemberId(trx, project.id, userId);
    await trx
      .insertInto("first_look_answer")
      .values({ element_id: input.elementId, member_id: me, answer: input.answer })
      .onConflict((oc) =>
        oc
          .columns(["element_id", "member_id"])
          .doUpdateSet({ answer: input.answer, answered_at: new Date() }),
      )
      .execute();
    return done(null);
  });
}

/** The participants' answers per element as counts, and how far they are (facilitator only). */
export interface FirstLookSummary {
  /** Counts per element id; an element nobody answered is absent. */
  counts: Record<string, FirstLookCounts>;
  /** Elements in the first look. */
  total: number;
  participants: number;
  /** Participants who answered every element of the first look. */
  finished: number;
}

/** The counts of the first look (facilitator only, `forbidden` otherwise). No name leaves it. */
export async function firstLookSummary(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectResult<FirstLookSummary>> {
  return readProject(db, userId, projectId, { project: ["update"] }, async (reader, project) =>
    done(await summaryOf(reader, project.id)),
  );
}

/** The counts of the first look, for the summary and the Overview's facts. */
export async function summaryOf(db: Db, projectId: string): Promise<FirstLookSummary> {
  const elements = await lookElements(db, projectId);
  const ids = elements.map((element) => element.id);
  const answers =
    ids.length === 0
      ? []
      : await db
          .selectFrom("first_look_answer")
          .innerJoin("member", "member.id", "first_look_answer.member_id")
          .select([
            "first_look_answer.element_id",
            "first_look_answer.answer",
            "first_look_answer.member_id",
            "member.role",
          ])
          .where("first_look_answer.element_id", "in", ids)
          .execute();
  const counts: Record<string, FirstLookCounts> = {};
  const perParticipant = new Map<string, number>();
  for (const row of answers) {
    // NOTE: EL22. The counts show what the participants think; the facilitator's own answers
    // stay out of them.
    if (!isFirstLookAnswer(row.answer) || row.role !== "participant") continue;
    const entry = counts[row.element_id] ?? { belongs: 0, not_sure: 0, not_belongs: 0 };
    entry[row.answer] += 1;
    counts[row.element_id] = entry;
    perParticipant.set(row.member_id, (perParticipant.get(row.member_id) ?? 0) + 1);
  }
  const participants = await db
    .selectFrom("member")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("organizationId", "=", projectId)
    .where("role", "=", "participant")
    .executeTakeFirstOrThrow();
  const finished =
    ids.length === 0 ? 0 : [...perParticipant.values()].filter((n) => n >= ids.length).length;
  return {
    counts,
    total: ids.length,
    participants: Number(participants.count),
    finished,
  };
}
