// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The detail phase (DT1 to DT5, ADR 0017). A member of an architecture group or the facilitator
// proposes the data type, cardinality and values of an element in the model; once that is
// settled, a terminologist or the facilitator proposes its codes (terminology.ts). Participants
// answer both kinds by consent; the facilitator addresses objections and settles, which copies
// the proposal onto the element (owner decision 2026-11-23). No query hands a member id to the
// screens: an objection reaches the facilitator without its author (EL2).
import type { Kysely, Transaction } from "kysely";
import type { Cardinality } from "@/lib/cardinality";
import type { Outcome } from "@/lib/consensus";
import { type DataTypeKey, isDataTypeKey } from "@/lib/data-types";
import {
  type CodeProposal,
  type ConsentState,
  type DetailBoard,
  type DetailCode,
  type DetailCodes,
  type DetailElement,
  type DetailFlagNote,
  type DetailKind,
  type DetailObjection,
  type DetailProposal,
  type DetailSource,
  type DetailStructure,
  type DetailValue,
  type DetailValueRound,
  isBindingStrength,
  isDetailAnswer,
  type ReviewState,
  reviewDone,
} from "@/lib/details";
import { type ElementReference, toReference } from "@/lib/elements";
import { DETAIL_PHASE, preparesAhead, stepVisible, writeOpen } from "@/lib/phase-access";
import { takesUnits } from "@/lib/units";
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
import { statusOf } from "../rounds/round.ts";
import type {
  AddressObjectionInput,
  AnswerDetailInput,
  ProposeDetailInput,
  SettleDetailInput,
} from "./schemas.ts";
import { settleTree } from "./tree-settle.ts";

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
    .select([
      "id",
      "name",
      "description",
      "data_type",
      "min_occurs",
      "max_occurs",
      "units",
      "code_system",
      "code",
      "code_display",
      "binding_strength",
      "value_set_url",
      "kind",
      "reference_title",
      "reference_url",
    ])
    .where("project_id", "=", projectId)
    .where("merged_into", "is", null)
    .where("id", "in", included)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
}

/**
 * Whether the user is a participant in a stakeholder group of the expert type: architecture
 * proposes structures (DT1), terminology proposes and reviews codes (DT4).
 */
export async function inExpertGroup(
  db: Db,
  projectId: string,
  userId: string,
  expertType: "architecture" | "terminology",
): Promise<boolean> {
  const row = await db
    .selectFrom("teamMember")
    .innerJoin("team", "team.id", "teamMember.teamId")
    .innerJoin("member", (join) =>
      join
        .onRef("member.userId", "=", "teamMember.userId")
        .onRef("member.organizationId", "=", "team.organizationId"),
    )
    .select("team.id")
    .where("team.organizationId", "=", projectId)
    .where("team.expert_type", "=", expertType)
    .where("teamMember.userId", "=", userId)
    .where("member.role", "=", "participant")
    .executeTakeFirst();
  return row !== undefined;
}

/** Whether the member may propose now: the facilitator ahead of the phase, an expert in it. */
export function mayProposeIn(project: LockedProject, expert: boolean): boolean {
  if (project.role === "facilitator") return preparesAhead(project.phase, DETAIL_PHASE);
  return expert && writeOpen(project.role, project.phase, "detail_propose");
}

function codeOf(system: string | null, code: string | null, display: string | null) {
  return system !== null && code !== null ? { system, code, display } : null;
}

/** A value of a list with its code, as the element or a proposal stores it. */
type CodedValue = DetailValue & { code: DetailCode | null };

export async function valueLists(
  db: Db,
  table: "element_value" | "detail_proposal_value",
  ids: readonly string[],
): Promise<Map<string, CodedValue[]>> {
  const lists = new Map<string, CodedValue[]>();
  if (ids.length === 0) return lists;
  const columns = ["text", "value", "code_system", "code", "code_display"] as const;
  const rows =
    table === "element_value"
      ? await db
          .selectFrom("element_value")
          .select(["element_id as owner", ...columns])
          .where("element_id", "in", ids)
          .orderBy("element_id")
          .orderBy("position")
          .execute()
      : await db
          .selectFrom("detail_proposal_value")
          .select(["proposal_id as owner", ...columns])
          .where("proposal_id", "in", ids)
          .orderBy("proposal_id")
          .orderBy("position")
          .execute();
  for (const row of rows) {
    const list = lists.get(row.owner) ?? [];
    list.push({
      text: row.text,
      value: row.value === null ? null : Number(row.value),
      code: codeOf(row.code_system, row.code, row.code_display),
    });
    lists.set(row.owner, list);
  }
  return lists;
}

/** The meanings and numbers of a value list, without its codes. */
const plain = (values: readonly CodedValue[]): DetailValue[] =>
  values.map(({ text, value }) => ({ text, value }));

/** The terminologists who could review a code proposal: participants in a terminology group. */
export async function terminologists(db: Db, projectId: string): Promise<string[]> {
  const rows = await db
    .selectFrom("teamMember")
    .innerJoin("team", "team.id", "teamMember.teamId")
    .innerJoin("member", (join) =>
      join
        .onRef("member.userId", "=", "teamMember.userId")
        .onRef("member.organizationId", "=", "team.organizationId"),
    )
    .select("member.id")
    .distinct()
    .where("team.organizationId", "=", projectId)
    .where("team.expert_type", "=", "terminology")
    .where("member.role", "=", "participant")
    .execute();
  return rows.map((row) => row.id);
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
    const architect =
      !facilitator && (await inExpertGroup(reader, project.id, userId, "architecture"));
    const terminologist =
      !facilitator && (await inExpertGroup(reader, project.id, userId, "terminology"));
    const readers: Record<DetailKind, boolean> = {
      structure: facilitator || architect,
      terminology: facilitator || terminologist,
    };
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

    const proposalOf = (elementId: string, kind: DetailKind) =>
      proposals.find((row) => row.element_id === elementId && row.kind === kind);
    // NOTE: DT3. The newest value round per proposal comes first; a participant sees no draft.
    const valueRoundRows =
      proposalIds.length === 0
        ? []
        : await reader
            .selectFrom("round_value_list")
            .innerJoin("round", "round.id", "round_value_list.round_id")
            .selectAll("round")
            .select([
              "round_value_list.proposal_id",
              "round_value_list.version as rated_version",
              "round_value_list.applied_version",
            ])
            .where("round_value_list.proposal_id", "in", proposalIds)
            .$if(!facilitator, (query) => query.where("round.opened_at", "is not", null))
            .orderBy("round.number", "desc")
            .execute();
    const now = new Date();
    const valueRoundOf = (proposalId: string | undefined): DetailValueRound | null => {
      const row = valueRoundRows.find((candidate) => candidate.proposal_id === proposalId);
      if (!row) return null;
      return {
        id: row.id,
        number: row.number,
        status: statusOf(row, now),
        version: row.rated_version,
        appliedVersion: row.applied_version,
      };
    };
    const valueRounds = facilitator
      ? await (async () => {
          const newest = await reader
            .selectFrom("round")
            .selectAll()
            .where("project_id", "=", project.id)
            .where("kind", "=", "values")
            .orderBy("number", "desc")
            .executeTakeFirst();
          const status = newest ? statusOf(newest, now) : "closed";
          return {
            mayStart:
              preparesAhead(project.phase, DETAIL_PHASE) &&
              (status === "draft" || status === "closed"),
            draft: newest && status === "draft" ? { id: newest.id, number: newest.number } : null,
          };
        })()
      : null;
    // NOTE: DT4. The facilitator may skip the review only when no terminologist but the proposer
    // could do it.
    const reviewers = facilitator ? await terminologists(reader, project.id) : [];
    const consent = (row: (typeof proposals)[number], readsAnswers: boolean): ConsentState => {
      const objection = (answer: (typeof answers)[number]): DetailObjection => ({
        id: answer.id,
        version: answer.version,
        reason: answer.reason ?? "",
        addressedNote: answer.addressed_note,
      });
      const ofProposal = answers.filter((answer) => answer.proposal_id === row.id);
      const current = ofProposal.filter((answer) => answer.version === row.version);
      const mine = current.find((answer) => answer.member_id === me);
      return {
        id: row.id,
        version: row.version,
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
    const structureView = (elementId: string): DetailProposal | null => {
      const row = proposalOf(elementId, "structure");
      if (!row) return null;
      return {
        ...consent(row, readers.structure),
        structure: {
          dataType: dataTypeOf(row.data_type),
          cardinality: cardinalityOf(row.min_occurs, row.max_occurs),
          values: plain(proposalValues.get(row.id) ?? []),
          units: row.units,
        },
        proposedBy: row.proposer_expert_type === null ? "facilitator" : "architecture",
      };
    };
    const codesView = (elementId: string): CodeProposal | null => {
      const row = proposalOf(elementId, "terminology");
      const state = row?.review_state as ReviewState | undefined;
      if (!row || state === undefined) return null;
      if (!readers.terminology && !reviewDone(state)) return null;
      return {
        ...consent(row, readers.terminology),
        codes: {
          code: codeOf(row.code_system, row.code, row.code_display),
          bindingStrength: isBindingStrength(row.binding_strength) ? row.binding_strength : null,
          valueSetUrl: row.value_set_url,
          valueCodes: (proposalValues.get(row.id) ?? []).map((value) => value.code),
        },
        proposedBy: row.proposer_expert_type === null ? "facilitator" : "terminology",
        review: {
          state,
          note: readers.terminology ? row.review_note : null,
          ownProposal: row.proposer_member_id === me,
          skippable: facilitator && reviewers.every((id) => id === row.proposer_member_id),
        },
      };
    };
    const elementViews = elements.map((element): DetailElement => {
      const values = elementValues.get(element.id) ?? [];
      const codes = codesView(element.id);
      return {
        id: element.id,
        name: element.name,
        description: element.description,
        reference: toReference(element),
        current: {
          dataType: dataTypeOf(element.data_type),
          cardinality: cardinalityOf(element.min_occurs, element.max_occurs),
          values: plain(values),
          units: element.units,
        },
        proposal: structureView(element.id),
        currentCodes: {
          code: codeOf(element.code_system, element.code, element.code_display),
          bindingStrength: isBindingStrength(element.binding_strength)
            ? element.binding_strength
            : null,
          valueSetUrl: element.value_set_url,
          valueCodes: values.map((value) => value.code),
        },
        codes,
        codesInReview: codes === null && proposalOf(element.id, "terminology") !== undefined,
        sources: sources.get(element.id) ?? [],
        flags: facilitator ? (flags.get(element.id) ?? []) : null,
        valueRound: valueRoundOf(proposalOf(element.id, "structure")?.id),
      };
    });

    return done({
      mayPropose: mayProposeIn(project, architect),
      mayProposeCodes: mayProposeIn(project, terminologist),
      mayReview: terminologist && project.phase === DETAIL_PHASE,
      mayAnswer:
        project.role === "participant" && writeOpen(project.role, project.phase, "detail_answer"),
      open: project.phase === DETAIL_PHASE,
      valueRounds,
      elements: elementViews,
    });
  });
}

/** Whether the group may answer a proposal: a structure or tree always, codes once reviewed (DT4). */
function consentOpen(proposal: { kind: string; review_state: string | null }): boolean {
  return proposal.kind !== "terminology" || reviewDone(proposal.review_state as ReviewState);
}

/** The proposal, locked, when its element or, for a tree (DT6), the proposal is in the project. */
async function lockedProposal(trx: Transaction<DB>, projectId: string, proposalId: string) {
  return trx
    .selectFrom("detail_proposal")
    .leftJoin("element", "element.id", "detail_proposal.element_id")
    .selectAll("detail_proposal")
    .where("detail_proposal.id", "=", proposalId)
    .where((eb) =>
      eb.or([
        eb("element.project_id", "=", projectId),
        eb("detail_proposal.project_id", "=", projectId),
      ]),
    )
    .forUpdate("detail_proposal")
    .executeTakeFirst();
}

/**
 * Proposes or revises the structure of an element in the model (DT1). The facilitator proposes
 * up to and in the detail phase (PR10); a participant only in the detail phase (`phase_closed`)
 * and only from an architecture group (`detail_not_architect`). A revision raises the version,
 * so every member answers again and the proposal is open until settled again (owner decision
 * 2026-11-23). Refused with `detail_version_changed` when someone else proposed in the meantime,
 * and with `detail_in_value_round` while its values are in a value round that is not closed (DT3).
 * A reference to another model gets a cardinality only (`detail_reference_structure`, EL26).
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
      if (!(await inExpertGroup(trx, project.id, userId, "architecture"))) {
        return refused("detail_not_architect");
      }
    }
    const element = await trx
      .selectFrom("element")
      .select(["id", "kind"])
      .where("id", "=", input.elementId)
      .where("project_id", "=", project.id)
      .where("merged_into", "is", null)
      .executeTakeFirst();
    if (!element) return refused("element_not_found");
    const inModel = (await modelElements(trx, project.id)).some((row) => row.id === element.id);
    if (!inModel) return refused("detail_not_in_model");
    if (element.kind === "reference" && (input.dataType !== null || input.values.length > 0)) {
      return refused("detail_reference_structure");
    }
    const problem = valuesProblem(input.dataType, input.values);
    if (problem !== null) return refused(problem);
    if (input.units.length > 0 && !takesUnits(input.dataType)) return refused("units_not_allowed");

    const existing = await trx
      .selectFrom("detail_proposal")
      .select(["id", "version"])
      .where("element_id", "=", element.id)
      .where("kind", "=", "structure")
      .forUpdate()
      .executeTakeFirst();
    if ((existing?.version ?? 0) !== input.version) return refused("detail_version_changed");
    if (existing && (await inValueRound(trx, existing.id))) return refused("detail_in_value_round");
    const saved = await writeStructure(trx, element.id, existing, {
      data_type: input.dataType,
      min_occurs: input.cardinality?.min ?? null,
      max_occurs: input.cardinality?.max ?? null,
      units: input.units,
      proposer_member_id: await actorMemberId(trx, project.id, userId),
      proposer_expert_type: project.role === "facilitator" ? null : "architecture",
      values: input.values,
    });
    await log(trx, userId, project.id, "detail_proposed", "detail_proposal", saved.id);
    return done({ proposalId: saved.id, version: saved.version });
  });
}

/**
 * Whether a structure proposal's values are in a value round that is not closed (DT3): a
 * draft, or one that takes ratings or waits to be closed.
 */
// NOTE: DT3, our own design. The round rates one version's values, so that version neither
// changes nor settles until the round closes; the facilitator closes it or takes the list out.
export async function inValueRound(db: Kysely<DB>, proposalId: string): Promise<boolean> {
  const row = await db
    .selectFrom("round_value_list")
    .innerJoin("round", "round.id", "round_value_list.round_id")
    .select("round.id")
    .where("round_value_list.proposal_id", "=", proposalId)
    .where("round.closed_at", "is", null)
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * Writes the first version of an element's structure proposal or a new one, with its values
 * (DT1, DT2). A new version is open again and every member answers it again; it sends the
 * element's codes back to their terminologist (owner decision 2026-11-23).
 */
export async function writeStructure(
  trx: Transaction<DB>,
  elementId: string,
  existing: { id: string; version: number } | undefined,
  structure: {
    data_type: string | null;
    min_occurs: number | null;
    max_occurs: number | null;
    units: string[];
    proposer_member_id: string;
    proposer_expert_type: "architecture" | null;
    values: readonly DetailValue[];
  },
): Promise<{ id: string; version: number }> {
  const { values, ...columns } = structure;
  const fields = { ...columns, proposed_at: new Date(), settled_at: null };
  const saved = existing
    ? await trx
        .updateTable("detail_proposal")
        .set({ ...fields, version: existing.version + 1 })
        .where("id", "=", existing.id)
        .returning(["id", "version"])
        .executeTakeFirstOrThrow()
    : await trx
        .insertInto("detail_proposal")
        .values({ ...fields, element_id: elementId })
        .returning(["id", "version"])
        .executeTakeFirstOrThrow();
  await trx.deleteFrom("detail_proposal_value").where("proposal_id", "=", saved.id).execute();
  if (values.length > 0) {
    await trx
      .insertInto("detail_proposal_value")
      .values(
        values.map((value, position) => ({
          proposal_id: saved.id,
          position,
          text: value.text,
          value: value.value,
        })),
      )
      .execute();
  }
  if (existing) {
    // NOTE: owner decision 2026-11-23. A new structure may change the value list, so the codes
    // of the element go back to their terminologist, settled or not.
    await trx
      .updateTable("detail_proposal")
      .set({ settled_at: null, review_state: "returned", review_note: null, reviewed_at: null })
      .where("element_id", "=", elementId)
      .where("kind", "=", "terminology")
      .execute();
  }
  return saved;
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
    if (!consentOpen(proposal)) return refused("detail_not_reviewed");
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
      .leftJoin("element", "element.id", "detail_proposal.element_id")
      .select(["detail_answer.id", "detail_proposal.id as proposal_id"])
      .where("detail_answer.id", "=", input.answerId)
      .where((eb) =>
        eb.or([
          eb("element.project_id", "=", project.id),
          eb("detail_proposal.project_id", "=", project.id),
        ]),
      )
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
 * Refused with `detail_objections_open` while an objection to this version is not addressed,
 * and with `detail_in_value_round` while its values are in a value round that is not closed (DT3).
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
    if (await inValueRound(trx, proposal.id)) return refused("detail_in_value_round");
    const open = await trx
      .selectFrom("detail_answer")
      .select("id")
      .where("proposal_id", "=", proposal.id)
      .where("version", "=", proposal.version)
      .where("answer", "=", "objection")
      .where("addressed_at", "is", null)
      .executeTakeFirst();
    if (open) return refused("detail_objections_open");

    if (!consentOpen(proposal)) return refused("detail_not_reviewed");
    const values = (await valueLists(trx, "detail_proposal_value", [proposal.id])).get(proposal.id);
    if (proposal.kind === "tree") {
      // NOTE: DT6, owner decision 2026-11-23: settling copies the tree onto the groups and elements.
      const problem = await settleTree(trx, project.id, proposal.id);
      if (problem !== null) return refused(problem);
    } else if (proposal.element_id === null) {
      return refused("detail_proposal_not_found");
    } else if (proposal.kind === "structure") {
      await trx
        .updateTable("element")
        .set({
          data_type: proposal.data_type,
          min_occurs: proposal.min_occurs,
          max_occurs: proposal.max_occurs,
          units: proposal.units,
          updated_at: new Date(),
        })
        .where("id", "=", proposal.element_id)
        .execute();
      await writeValues(trx, proposal.element_id, plain(values ?? []));
    } else {
      const problem = await settleCodes(
        trx,
        { ...proposal, element_id: proposal.element_id },
        values ?? [],
      );
      if (problem !== null) return refused(problem);
    }
    await trx
      .updateTable("detail_proposal")
      .set({ settled_at: new Date() })
      .where("id", "=", proposal.id)
      .execute();
    await log(trx, userId, project.id, "detail_settled", "detail_proposal", proposal.id);
    return done(null);
  });
}

/**
 * Copies a code proposal onto the element and its values (DT5). Refused with
 * `detail_structure_open` while the structure is not settled, and with
 * `detail_value_codes_mismatch` when the value list no longer has one value per code.
 */
async function settleCodes(
  trx: Transaction<DB>,
  proposal: {
    element_id: string;
    code_system: string | null;
    code: string | null;
    code_display: string | null;
    binding_strength: string | null;
    value_set_url: string | null;
  },
  valueCodes: readonly CodedValue[],
): Promise<"detail_structure_open" | "detail_value_codes_mismatch" | null> {
  const structure = await trx
    .selectFrom("detail_proposal")
    .select("settled_at")
    .where("element_id", "=", proposal.element_id)
    .where("kind", "=", "structure")
    .executeTakeFirst();
  if (!structure?.settled_at) return "detail_structure_open";
  const values = await trx
    .selectFrom("element_value")
    .select("position")
    .where("element_id", "=", proposal.element_id)
    .orderBy("position")
    .forUpdate()
    .execute();
  if (values.length !== valueCodes.length) return "detail_value_codes_mismatch";
  await trx
    .updateTable("element")
    .set({
      code_system: proposal.code_system,
      code: proposal.code,
      code_display: proposal.code_display,
      binding_strength: proposal.binding_strength,
      value_set_url: proposal.value_set_url,
      updated_at: new Date(),
    })
    .where("id", "=", proposal.element_id)
    .execute();
  for (const [index, row] of values.entries()) {
    const code = valueCodes[index]?.code ?? null;
    await trx
      .updateTable("element_value")
      .set({
        code_system: code?.system ?? null,
        code: code?.code ?? null,
        code_display: code?.display ?? null,
      })
      .where("element_id", "=", proposal.element_id)
      .where("position", "=", row.position)
      .execute();
  }
  return null;
}

/** How far the detail phase is, for the facilitator's checklist (counts only). */
export interface DetailProgress {
  /** Elements in the model. */
  inModel: number;
  /** Of them, with a structure proposal. */
  proposed: number;
  /** Of them, with the current structure settled. */
  settled: number;
  /** Of them, the ones that take codes: every element but a reference element (EL26). */
  codable: number;
  /** Of them, with their codes settled (DT4); open codes do not hold up the hand-off. */
  codesSettled: number;
  /** Objections to current versions of either kind the facilitator has not addressed. */
  openObjections: number;
}

/** The counts of the detail phase (DT1, DT2, DT4). */
export async function detailProgress(db: Db, projectId: string): Promise<DetailProgress> {
  const elements = await modelElements(db, projectId);
  const ids = elements.map((element) => element.id);
  // NOTE: EL26. A reference element gets no codes, so it does not count towards them.
  const codable = elements.filter((element) => element.kind !== "reference").length;
  if (ids.length === 0) {
    return { inModel: 0, proposed: 0, settled: 0, codable: 0, codesSettled: 0, openObjections: 0 };
  }
  const proposals = await db
    .selectFrom("detail_proposal")
    .select(["id", "kind", "settled_at"])
    // The tree proposal (DT6) counts towards the open objections.
    .where((eb) => eb.or([eb("element_id", "in", ids), eb("project_id", "=", projectId)]))
    .execute();
  const structures = proposals.filter((proposal) => proposal.kind === "structure");
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
    codable,
    proposed: structures.length,
    settled: structures.filter((proposal) => proposal.settled_at !== null).length,
    codesSettled: proposals.filter(
      (proposal) => proposal.kind === "terminology" && proposal.settled_at !== null,
    ).length,
    openObjections: Number(objections?.count ?? 0),
  };
}

/**
 * What waits for the user in the detail phase: the open proposals the group answers (a
 * structure, or codes once reviewed), how many of them they answered in their current version,
 * and, for a terminologist, the code proposals of others that wait for their review (DT4).
 */
export async function ownDetailProgress(
  db: Db,
  projectId: string,
  userId: string,
): Promise<{ open: number; answered: number; toReview: number }> {
  const none = { open: 0, answered: 0, toReview: 0 };
  const ids = (await modelElements(db, projectId)).map((element) => element.id);
  if (ids.length === 0) return none;
  const unsettled = await db
    .selectFrom("detail_proposal")
    .select(["id", "kind", "review_state", "proposer_member_id"])
    .where((eb) => eb.or([eb("element_id", "in", ids), eb("project_id", "=", projectId)]))
    .where("settled_at", "is", null)
    .execute();
  const me = await db
    .selectFrom("member")
    .select("id")
    .where("organizationId", "=", projectId)
    .where("userId", "=", userId)
    .executeTakeFirst();
  const toReview =
    me !== undefined && (await inExpertGroup(db, projectId, userId, "terminology"))
      ? unsettled.filter(
          (proposal) =>
            proposal.review_state === "pending" && proposal.proposer_member_id !== me.id,
        ).length
      : 0;
  const open = unsettled.filter(consentOpen);
  if (open.length === 0 || me === undefined) return { ...none, toReview };
  const answered = await db
    .selectFrom("detail_answer")
    .innerJoin("detail_proposal", "detail_proposal.id", "detail_answer.proposal_id")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where(
      "detail_answer.proposal_id",
      "in",
      open.map((proposal) => proposal.id),
    )
    .whereRef("detail_answer.version", "=", "detail_proposal.version")
    .where("detail_answer.member_id", "=", me.id)
    .executeTakeFirst();
  return { open: open.length, answered: Number(answered?.count ?? 0), toReview };
}

/** An element in the model with the structure it carries and whether its proposal is settled. */
export interface ModelStructure {
  id: string;
  name: string;
  /** The model a reference element refers to (EL26); null for a data element. */
  reference: ElementReference | null;
  settled: boolean;
  structure: DetailStructure;
  /** Whether the codes are settled; open codes are marked open (DT4). */
  codesSettled: boolean;
  codes: DetailCodes;
}

/** The elements in the model with their structure, for the recap of the detail phase (PR13). */
export async function modelStructures(db: Db, projectId: string): Promise<ModelStructure[]> {
  const elements = await modelElements(db, projectId);
  const ids = elements.map((element) => element.id);
  const values = await valueLists(db, "element_value", ids);
  const settledRows =
    ids.length === 0
      ? []
      : await db
          .selectFrom("detail_proposal")
          .select(["element_id", "kind"])
          .where("element_id", "in", ids)
          .where("settled_at", "is not", null)
          .execute();
  const settled = (id: string, kind: DetailKind) =>
    settledRows.some((row) => row.element_id === id && row.kind === kind);
  return elements.map((element) => {
    const list = values.get(element.id) ?? [];
    return {
      id: element.id,
      name: element.name,
      reference: toReference(element),
      settled: settled(element.id, "structure"),
      structure: {
        dataType: dataTypeOf(element.data_type),
        cardinality: cardinalityOf(element.min_occurs, element.max_occurs),
        values: plain(list),
        units: element.units,
      },
      codesSettled: settled(element.id, "terminology"),
      codes: {
        code: codeOf(element.code_system, element.code, element.code_display),
        bindingStrength: isBindingStrength(element.binding_strength)
          ? element.binding_strength
          : null,
        valueSetUrl: element.value_set_url,
        valueCodes: list.map((value) => value.code),
      },
    };
  });
}
