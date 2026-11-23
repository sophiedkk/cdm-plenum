// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The structure step of the detail phase (DT1, DT2, ADR 0017). A member of an architecture group
// or the facilitator proposes the data type, cardinality and values of an element in the model;
// participants answer by consent; the facilitator addresses objections and settles the proposal,
// which copies the structure onto the element (owner decision 2026-11-23). No query hands a
// member id to the screens: an objection reaches the facilitator without its author (EL2).
import type { Kysely, Transaction } from "kysely";
import type { Cardinality } from "@/lib/cardinality";
import type { Outcome } from "@/lib/consensus";
import { type DataTypeKey, isDataTypeKey } from "@/lib/data-types";
import {
  type DetailBoard,
  type DetailElement,
  type DetailFlagNote,
  type DetailObjection,
  type DetailProposal,
  type DetailSource,
  type DetailStructure,
  type DetailValue,
  isDetailAnswer,
} from "@/lib/details";
import { DETAIL_PHASE, preparesAhead, stepVisible, writeOpen } from "@/lib/phase-access";
import type { DB } from "../db/schema.gen.ts";
import { valuesProblem, writeValues } from "../elements/queries.ts";
import {
  done,
  type LockedProject,
  lockProject,
  type ProjectResult,
  phaseOpenFor,
  readProject,
  refused,
} from "../projects/access.ts";
import { actorMemberId } from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import type {
  AddressObjectionInput,
  AnswerDetailInput,
  ProposeDetailInput,
  SettleDetailInput,
} from "./schemas.ts";

type Db = Kysely<DB>;

function cardinalityOf(min: number | null, max: number | null): Cardinality | null {
  return min === 0 || min === 1 ? { min, max } : null;
}

function dataTypeOf(value: string | null): DataTypeKey | null {
  return value !== null && isDataTypeKey(value) ? value : null;
}

/**
 * The elements in the model (DT1): on the board, and included by the newest closed round that
 * rated them (DE1). An element no round rated, or one without consensus, is not in the model yet.
 */
export async function modelElements(db: Db, projectId: string) {
  const outcomes = await db
    .selectFrom("round_element")
    .innerJoin("round", "round.id", "round_element.round_id")
    .distinctOn("round_element.element_id")
    .select(["round_element.element_id", "round_element.outcome"])
    .where("round.project_id", "=", projectId)
    .where("round.closed_at", "is not", null)
    .orderBy("round_element.element_id")
    .orderBy("round.number", "desc")
    .execute();
  const included = outcomes
    .filter((row) => (row.outcome as Outcome | null) === "included")
    .map((row) => row.element_id);
  if (included.length === 0) return [];
  return db
    .selectFrom("element")
    .select(["id", "name", "description", "data_type", "min_occurs", "max_occurs"])
    .where("project_id", "=", projectId)
    .where("merged_into", "is", null)
    .where("id", "in", included)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
}

/** Whether the user sits in a stakeholder group of expert type architecture (DT1). */
async function inArchitectureGroup(db: Db, projectId: string, userId: string): Promise<boolean> {
  const row = await db
    .selectFrom("teamMember")
    .innerJoin("team", "team.id", "teamMember.teamId")
    .select("team.id")
    .where("team.organizationId", "=", projectId)
    .where("team.expert_type", "=", "architecture")
    .where("teamMember.userId", "=", userId)
    .executeTakeFirst();
  return row !== undefined;
}

/** Whether the member may propose now: the facilitator ahead of the phase, an architect in it. */
function mayProposeIn(project: LockedProject, architect: boolean): boolean {
  if (project.role === "facilitator") return preparesAhead(project.phase, DETAIL_PHASE);
  return architect && writeOpen(project.role, project.phase, "detail_propose");
}

async function valueLists(
  db: Db,
  table: "element_value" | "detail_proposal_value",
  ids: readonly string[],
): Promise<Map<string, DetailValue[]>> {
  const lists = new Map<string, DetailValue[]>();
  if (ids.length === 0) return lists;
  const rows =
    table === "element_value"
      ? await db
          .selectFrom("element_value")
          .select(["element_id as owner", "text", "value"])
          .where("element_id", "in", ids)
          .orderBy("element_id")
          .orderBy("position")
          .execute()
      : await db
          .selectFrom("detail_proposal_value")
          .select(["proposal_id as owner", "text", "value"])
          .where("proposal_id", "in", ids)
          .orderBy("proposal_id")
          .orderBy("position")
          .execute();
  for (const row of rows) {
    const list = lists.get(row.owner) ?? [];
    list.push({ text: row.text, value: row.value === null ? null : Number(row.value) });
    lists.set(row.owner, list);
  }
  return lists;
}

/**
 * The structure step for the signed-in member (DT1, DT2): every element in the model with its
 * proposal and the source elements it is linked to. The facilitator and the members of an
 * architecture group also get the answers as counts and objections without names; only the
 * facilitator gets the detail flags of the rounds (DE17). Refused with `phase_closed` while the
 * phase hides the step from a participant.
 */
export async function detailBoard(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectResult<DetailBoard>> {
  return readProject(db, userId, projectId, null, async (reader, project) => {
    if (!stepVisible(project.role, project.phase, "details")) return refused("phase_closed");
    const facilitator = project.role === "facilitator";
    const architect = !facilitator && (await inArchitectureGroup(reader, project.id, userId));
    const readsAnswers = facilitator || architect;
    const me = await actorMemberId(reader, project.id, userId);
    const elements = await modelElements(reader, project.id);
    const ids = elements.map((element) => element.id);

    const proposals =
      ids.length === 0
        ? []
        : await reader
            .selectFrom("detail_proposal")
            .selectAll()
            .where("element_id", "in", ids)
            .execute();
    const proposalIds = proposals.map((proposal) => proposal.id);
    const answers =
      proposalIds.length === 0
        ? []
        : await reader
            .selectFrom("detail_answer")
            .select([
              "id",
              "proposal_id",
              "version",
              "member_id",
              "answer",
              "reason",
              "addressed_note",
            ])
            .where("proposal_id", "in", proposalIds)
            .orderBy("answered_at")
            .orderBy("id")
            .execute();
    const proposalValues = await valueLists(reader, "detail_proposal_value", proposalIds);
    const elementValues = await valueLists(reader, "element_value", ids);

    const sourceRows =
      ids.length === 0
        ? []
        : await reader
            .selectFrom("element_source_link as link")
            .innerJoin("source_element", "source_element.id", "link.source_element_id")
            .innerJoin("source_model", "source_model.id", "source_element.source_model_id")
            .select([
              "link.element_id",
              "source_model.title",
              "source_element.name",
              "source_element.type",
              "source_element.min_occurs",
              "source_element.max_occurs",
            ])
            .where("link.element_id", "in", ids)
            .orderBy("source_model.created_at")
            .orderBy("source_element.position")
            .execute();
    const sources = new Map<string, DetailSource[]>();
    for (const row of sourceRows) {
      const list = sources.get(row.element_id) ?? [];
      list.push({
        model: row.title,
        name: row.name,
        type: row.type,
        cardinality: cardinalityOf(row.min_occurs, row.max_occurs),
      });
      sources.set(row.element_id, list);
    }

    const flags = new Map<string, DetailFlagNote[]>();
    if (facilitator && ids.length > 0) {
      const rows = await reader
        .selectFrom("detail_flag")
        .select(["element_id", "kind", "reason"])
        .where("element_id", "in", ids)
        .orderBy("updated_at")
        .orderBy("id")
        .execute();
      for (const row of rows) {
        const list = flags.get(row.element_id) ?? [];
        list.push({ kind: row.kind as DetailFlagNote["kind"], reason: row.reason });
        flags.set(row.element_id, list);
      }
    }

    const proposalOf = new Map(proposals.map((proposal) => [proposal.element_id, proposal]));
    const view = (elementId: string): DetailProposal | null => {
      const row = proposalOf.get(elementId);
      if (!row) return null;
      const mine = answers.find(
        (answer) =>
          answer.proposal_id === row.id &&
          answer.version === row.version &&
          answer.member_id === me,
      );
      const objection = (answer: (typeof answers)[number]): DetailObjection => ({
        id: answer.id,
        version: answer.version,
        reason: answer.reason ?? "",
        addressedNote: answer.addressed_note,
      });
      const ofProposal = answers.filter((answer) => answer.proposal_id === row.id);
      const current = ofProposal.filter((answer) => answer.version === row.version);
      return {
        id: row.id,
        version: row.version,
        structure: {
          dataType: dataTypeOf(row.data_type),
          cardinality: cardinalityOf(row.min_occurs, row.max_occurs),
          values: proposalValues.get(row.id) ?? [],
        },
        proposedBy: row.proposer_expert_type === null ? "facilitator" : "architecture",
        settledAt: row.settled_at?.toISOString() ?? null,
        own:
          mine && isDetailAnswer(mine.answer) ? { answer: mine.answer, reason: mine.reason } : null,
        answers: readsAnswers
          ? {
              agreed: current.filter((answer) => answer.answer === "agree").length,
              objections: current.filter((answer) => answer.answer === "objection").map(objection),
            }
          : null,
        history: readsAnswers
          ? ofProposal
              .filter((answer) => answer.version < row.version && answer.answer === "objection")
              .map(objection)
          : null,
      };
    };

    return done({
      mayPropose: mayProposeIn(project, architect),
      mayAnswer:
        project.role === "participant" && writeOpen(project.role, project.phase, "detail_answer"),
      open: project.phase === DETAIL_PHASE,
      elements: elements.map(
        (element): DetailElement => ({
          id: element.id,
          name: element.name,
          description: element.description,
          current: {
            dataType: dataTypeOf(element.data_type),
            cardinality: cardinalityOf(element.min_occurs, element.max_occurs),
            values: elementValues.get(element.id) ?? [],
          },
          proposal: view(element.id),
          sources: sources.get(element.id) ?? [],
          flags: facilitator ? (flags.get(element.id) ?? []) : null,
        }),
      ),
    });
  });
}

/** The proposal with its element, locked, when it belongs to the project. */
async function lockedProposal(trx: Transaction<DB>, projectId: string, proposalId: string) {
  return trx
    .selectFrom("detail_proposal")
    .innerJoin("element", "element.id", "detail_proposal.element_id")
    .selectAll("detail_proposal")
    .where("detail_proposal.id", "=", proposalId)
    .where("element.project_id", "=", projectId)
    .forUpdate("detail_proposal")
    .executeTakeFirst();
}

/**
 * Proposes or revises the structure of an element in the model (DT1). The facilitator proposes
 * up to and in the detail phase (PR10); a participant only in the detail phase (`phase_closed`)
 * and only from an architecture group (`detail_not_architect`). A revision raises the version,
 * so every member answers again and the proposal is open until settled again (owner decision
 * 2026-11-23). Refused with `detail_version_changed` when someone else proposed in the meantime.
 */
export async function proposeDetail(
  db: Db,
  userId: string,
  input: ProposeDetailInput,
): Promise<ProjectResult<{ proposalId: string; version: number }>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, input.projectId, userId);
    if (!project) return refused("not_found");
    if (project.role === "facilitator") {
      if (!preparesAhead(project.phase, DETAIL_PHASE)) return refused("phase_closed");
    } else {
      if (!(await phaseOpenFor(trx, project, "detail_propose"))) return refused("phase_closed");
      if (!(await inArchitectureGroup(trx, project.id, userId))) {
        return refused("detail_not_architect");
      }
    }
    const element = await trx
      .selectFrom("element")
      .select("id")
      .where("id", "=", input.elementId)
      .where("project_id", "=", project.id)
      .where("merged_into", "is", null)
      .executeTakeFirst();
    if (!element) return refused("element_not_found");
    const inModel = (await modelElements(trx, project.id)).some((row) => row.id === element.id);
    if (!inModel) return refused("detail_not_in_model");
    const problem = valuesProblem(input.dataType, input.values);
    if (problem !== null) return refused(problem);

    const me = await actorMemberId(trx, project.id, userId);
    const fields = {
      data_type: input.dataType,
      min_occurs: input.cardinality?.min ?? null,
      max_occurs: input.cardinality?.max ?? null,
      proposer_member_id: me,
      proposer_expert_type: project.role === "facilitator" ? null : "architecture",
      proposed_at: new Date(),
      settled_at: null,
    };
    const existing = await trx
      .selectFrom("detail_proposal")
      .select(["id", "version"])
      .where("element_id", "=", element.id)
      .forUpdate()
      .executeTakeFirst();
    if ((existing?.version ?? 0) !== input.version) return refused("detail_version_changed");
    const saved = existing
      ? await trx
          .updateTable("detail_proposal")
          .set({ ...fields, version: existing.version + 1 })
          .where("id", "=", existing.id)
          .returning(["id", "version"])
          .executeTakeFirstOrThrow()
      : await trx
          .insertInto("detail_proposal")
          .values({ ...fields, element_id: element.id })
          .returning(["id", "version"])
          .executeTakeFirstOrThrow();
    await trx.deleteFrom("detail_proposal_value").where("proposal_id", "=", saved.id).execute();
    if (input.values.length > 0) {
      await trx
        .insertInto("detail_proposal_value")
        .values(
          input.values.map((value, position) => ({
            proposal_id: saved.id,
            position,
            text: value.text,
            value: value.value,
          })),
        )
        .execute();
    }
    await log(trx, userId, project.id, "detail_proposed", "detail_proposal", saved.id);
    return done({ proposalId: saved.id, version: saved.version });
  });
}

/**
 * Saves a participant's answer to the current version of a proposal (DT2), replacing their
 * earlier answer to it. The facilitator settles and does not answer (`forbidden`). Refused with
 * `phase_closed` outside the detail phase, `detail_settled` once settled and
 * `detail_version_changed` when the proposal was revised after the member read it.
 */
export async function answerDetail(
  db: Db,
  userId: string,
  input: AnswerDetailInput,
): Promise<ProjectResult<null>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, input.projectId, userId);
    if (!project) return refused("not_found");
    if (project.role !== "participant") return refused("forbidden");
    if (!(await phaseOpenFor(trx, project, "detail_answer"))) return refused("phase_closed");
    const proposal = await lockedProposal(trx, project.id, input.proposalId);
    if (!proposal) return refused("detail_proposal_not_found");
    if (proposal.settled_at !== null) return refused("detail_settled");
    if (proposal.version !== input.version) return refused("detail_version_changed");
    const me = await actorMemberId(trx, project.id, userId);
    await trx
      .insertInto("detail_answer")
      .values({
        proposal_id: proposal.id,
        version: proposal.version,
        member_id: me,
        answer: input.answer,
        reason: input.reason,
      })
      .onConflict((oc) =>
        oc.columns(["proposal_id", "version", "member_id"]).doUpdateSet({
          answer: input.answer,
          reason: input.reason,
          addressed_at: null,
          addressed_note: null,
          answered_at: new Date(),
        }),
      )
      .execute();
    await log(trx, userId, project.id, "detail_answered", "detail_proposal", proposal.id);
    return done(null);
  });
}

/**
 * Marks an objection to the current version addressed, with a note every proposer reads (DT2,
 * facilitator only). Refused with `phase_closed` outside the detail phase and
 * `detail_answer_not_found` for anything but an objection to an open proposal's current version.
 */
export async function addressObjection(
  db: Db,
  userId: string,
  input: AddressObjectionInput,
): Promise<ProjectResult<null>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, input.projectId, userId);
    if (!project) return refused("not_found");
    if (project.role !== "facilitator") return refused("forbidden");
    if (project.phase !== DETAIL_PHASE) return refused("phase_closed");
    const answer = await trx
      .selectFrom("detail_answer")
      .innerJoin("detail_proposal", "detail_proposal.id", "detail_answer.proposal_id")
      .innerJoin("element", "element.id", "detail_proposal.element_id")
      .select(["detail_answer.id", "detail_proposal.id as proposal_id"])
      .where("detail_answer.id", "=", input.answerId)
      .where("element.project_id", "=", project.id)
      .where("detail_answer.answer", "=", "objection")
      .whereRef("detail_answer.version", "=", "detail_proposal.version")
      .where("detail_proposal.settled_at", "is", null)
      .forUpdate("detail_answer")
      .executeTakeFirst();
    if (!answer) return refused("detail_answer_not_found");
    await trx
      .updateTable("detail_answer")
      .set({ addressed_at: new Date(), addressed_note: input.note })
      .where("id", "=", answer.id)
      .execute();
    await log(
      trx,
      userId,
      project.id,
      "detail_objection_addressed",
      "detail_proposal",
      answer.proposal_id,
    );
    return done(null);
  });
}

/**
 * Settles the current version of a proposal (DT2, facilitator only) and copies its structure
 * onto the element, so the board and the exports read one place (owner decision 2026-11-23).
 * Refused with `detail_objections_open` while an objection to this version is not addressed.
 */
// NOTE: no spec governs when consent is reached, our own design after Sociocracy 3.0: the
// facilitator checks for objections and closes the round of answers, as S3's facilitator does.
export async function settleDetail(
  db: Db,
  userId: string,
  input: SettleDetailInput,
): Promise<ProjectResult<null>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, input.projectId, userId);
    if (!project) return refused("not_found");
    if (project.role !== "facilitator") return refused("forbidden");
    if (project.phase !== DETAIL_PHASE) return refused("phase_closed");
    const proposal = await lockedProposal(trx, project.id, input.proposalId);
    if (!proposal) return refused("detail_proposal_not_found");
    if (proposal.settled_at !== null) return refused("detail_settled");
    if (proposal.version !== input.version) return refused("detail_version_changed");
    const open = await trx
      .selectFrom("detail_answer")
      .select("id")
      .where("proposal_id", "=", proposal.id)
      .where("version", "=", proposal.version)
      .where("answer", "=", "objection")
      .where("addressed_at", "is", null)
      .executeTakeFirst();
    if (open) return refused("detail_objections_open");

    const values = (await valueLists(trx, "detail_proposal_value", [proposal.id])).get(proposal.id);
    await trx
      .updateTable("element")
      .set({
        data_type: proposal.data_type,
        min_occurs: proposal.min_occurs,
        max_occurs: proposal.max_occurs,
        updated_at: new Date(),
      })
      .where("id", "=", proposal.element_id)
      .execute();
    await writeValues(trx, proposal.element_id, values ?? []);
    await trx
      .updateTable("detail_proposal")
      .set({ settled_at: new Date() })
      .where("id", "=", proposal.id)
      .execute();
    await log(trx, userId, project.id, "detail_settled", "detail_proposal", proposal.id);
    return done(null);
  });
}

/** How far the structure step is, for the facilitator's checklist (counts only). */
export interface DetailProgress {
  /** Elements in the model. */
  inModel: number;
  /** Of them, with a proposal. */
  proposed: number;
  /** Of them, with the current version settled. */
  settled: number;
  /** Objections to current versions the facilitator has not addressed. */
  openObjections: number;
}

/** The counts of the structure step (DT1, DT2). */
export async function detailProgress(db: Db, projectId: string): Promise<DetailProgress> {
  const ids = (await modelElements(db, projectId)).map((element) => element.id);
  if (ids.length === 0) return { inModel: 0, proposed: 0, settled: 0, openObjections: 0 };
  const proposals = await db
    .selectFrom("detail_proposal")
    .select(["id", "version", "settled_at"])
    .where("element_id", "in", ids)
    .execute();
  const open = proposals.filter((proposal) => proposal.settled_at === null);
  const objections =
    open.length === 0
      ? undefined
      : await db
          .selectFrom("detail_answer")
          .innerJoin("detail_proposal", "detail_proposal.id", "detail_answer.proposal_id")
          .select((eb) => eb.fn.countAll<string>().as("count"))
          .where(
            "detail_answer.proposal_id",
            "in",
            open.map((proposal) => proposal.id),
          )
          .whereRef("detail_answer.version", "=", "detail_proposal.version")
          .where("detail_answer.answer", "=", "objection")
          .where("detail_answer.addressed_at", "is", null)
          .executeTakeFirst();
  return {
    inModel: ids.length,
    proposed: proposals.length,
    settled: proposals.length - open.length,
    openObjections: Number(objections?.count ?? 0),
  };
}

/** The open proposals and how many of them the user answered in their current version (DT2). */
export async function ownDetailProgress(
  db: Db,
  projectId: string,
  userId: string,
): Promise<{ open: number; answered: number }> {
  const ids = (await modelElements(db, projectId)).map((element) => element.id);
  if (ids.length === 0) return { open: 0, answered: 0 };
  const open = await db
    .selectFrom("detail_proposal")
    .select(["id", "version"])
    .where("element_id", "in", ids)
    .where("settled_at", "is", null)
    .execute();
  if (open.length === 0) return { open: 0, answered: 0 };
  const answered = await db
    .selectFrom("detail_answer")
    .innerJoin("detail_proposal", "detail_proposal.id", "detail_answer.proposal_id")
    .innerJoin("member", "member.id", "detail_answer.member_id")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where(
      "detail_answer.proposal_id",
      "in",
      open.map((proposal) => proposal.id),
    )
    .whereRef("detail_answer.version", "=", "detail_proposal.version")
    .where("member.organizationId", "=", projectId)
    .where("member.userId", "=", userId)
    .executeTakeFirst();
  return { open: open.length, answered: Number(answered?.count ?? 0) };
}

/** An element in the model with the structure it carries and whether its proposal is settled. */
export interface ModelStructure {
  id: string;
  name: string;
  settled: boolean;
  structure: DetailStructure;
}

/** The elements in the model with their structure, for the recap of the detail phase (PR13). */
export async function modelStructures(db: Db, projectId: string): Promise<ModelStructure[]> {
  const elements = await modelElements(db, projectId);
  const ids = elements.map((element) => element.id);
  const values = await valueLists(db, "element_value", ids);
  const settled = new Set(
    ids.length === 0
      ? []
      : (
          await db
            .selectFrom("detail_proposal")
            .select("element_id")
            .where("element_id", "in", ids)
            .where("settled_at", "is not", null)
            .execute()
        ).map((row) => row.element_id),
  );
  return elements.map((element) => ({
    id: element.id,
    name: element.name,
    settled: settled.has(element.id),
    structure: {
      dataType: dataTypeOf(element.data_type),
      cardinality: cardinalityOf(element.min_occurs, element.max_occurs),
      values: values.get(element.id) ?? [],
    },
  }));
}
