// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The tree of the model in the structure step (DT6, ADR 0021). An architect or the facilitator
// proposes the tree of the whole project; it is a detail proposal of kind `tree` without an
// element, so the answers, objections, revisions and settling of DT2 (queries.ts) work on it
// unchanged. The proposed groups and elements are rows of their own; settling copies them onto
// the groups and elements (tree-settle.ts). No query hands a member id to the screens (EL2).
import type { Kysely } from "kysely";
import { type ElementPrompt, isElementPrompt } from "@/lib/brainstorm";
import type { Cardinality } from "@/lib/cardinality";
import { type ConsentState, isDetailAnswer } from "@/lib/details";
import {
  depthFirst,
  type ModelTree,
  type SubBlockLink,
  type TreeBoard,
  type TreeElement,
  type TreeGroup,
  type TreeProposal,
} from "@/lib/model-tree";
import { DETAIL_PHASE, preparesAhead, stepVisible, writeOpen } from "@/lib/phase-access";
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
import { log } from "../projects/queries.ts";
import { inExpertGroup, mayProposeIn, modelElements } from "./queries.ts";
import type { ProposeTreeInput } from "./schemas.ts";
import { treeProblem } from "./tree-settle.ts";

type Db = Kysely<DB>;

function cardinalityOf(min: number | null, max: number | null): Cardinality | null {
  return min === 0 || min === 1 ? { min, max } : null;
}

function linkOf(title: string | null, url: string | null): SubBlockLink | null {
  return title === null ? null : { title, url };
}

interface GroupRow {
  id: string;
  name: string | null;
  prompt: string | null;
  parent_id: string | null;
  min_occurs: number | null;
  max_occurs: number | null;
  sub_block: boolean;
  sub_block_title: string | null;
  sub_block_url: string | null;
}

function toGroup(row: GroupRow): TreeGroup {
  return {
    id: row.id,
    name: row.name,
    prompt: isElementPrompt(row.prompt) ? (row.prompt as ElementPrompt) : null,
    parentId: row.parent_id,
    cardinality: cardinalityOf(row.min_occurs, row.max_occurs),
    subBlock: row.sub_block,
    subBlockLink: linkOf(row.sub_block_title, row.sub_block_url),
  };
}

/** The project's groups as the tree has them now, in depth-first order. */
export async function projectGroups(db: Db, projectId: string): Promise<TreeGroup[]> {
  const rows = await db
    .selectFrom("element_group")
    .select([
      "id",
      "name",
      "prompt",
      "parent_id",
      "min_occurs",
      "max_occurs",
      "sub_block",
      "sub_block_title",
      "sub_block_url",
    ])
    .where("project_id", "=", projectId)
    .orderBy("position")
    .orderBy("created_at")
    .execute();
  return depthFirst(rows.map(toGroup));
}

/**
 * The tree the project has now (DT6): the settled tree, or before that the groups of discover
 * (EL18), with the elements in the model.
 */
export async function currentTree(db: Db, projectId: string): Promise<ModelTree> {
  const ids = (await modelElements(db, projectId)).map((element) => element.id);
  const elements =
    ids.length === 0
      ? []
      : await db
          .selectFrom("element")
          .select(["id", "name", "group_id", "registration"])
          .where("id", "in", ids)
          .orderBy("created_at")
          .orderBy("id")
          .execute();
  return {
    groups: await projectGroups(db, projectId),
    elements: elements.map(
      (row): TreeElement => ({
        id: row.id,
        name: row.name,
        groupId: row.group_id,
        registration: row.registration,
      }),
    ),
  };
}

/** The tree a proposal proposes, with the names of the groups and elements it places. */
async function proposedTree(db: Db, proposalId: string): Promise<ModelTree> {
  const groups = await db
    .selectFrom("tree_proposal_group as row")
    .leftJoin("element_group", "element_group.id", "row.group_id")
    .select([
      "row.group_id as id",
      "row.name as added_name",
      "element_group.id as existing",
      "element_group.name",
      "element_group.prompt",
      "row.parent_id",
      "row.min_occurs",
      "row.max_occurs",
      "row.sub_block",
      "row.sub_block_title",
      "row.sub_block_url",
    ])
    .where("row.proposal_id", "=", proposalId)
    .orderBy("row.position")
    .execute();
  // A group the proposal named but that no longer exists has nothing left to show.
  const shown = groups.filter((row) => row.existing !== null || row.added_name !== null);
  const elements = await db
    .selectFrom("tree_proposal_element as row")
    .innerJoin("element", "element.id", "row.element_id")
    .select(["element.id", "element.name", "row.group_id", "row.registration"])
    .where("row.proposal_id", "=", proposalId)
    .where("element.merged_into", "is", null)
    .orderBy("element.created_at")
    .orderBy("element.id")
    .execute();
  return {
    groups: depthFirst(
      shown.map((row) =>
        toGroup({
          ...row,
          name: row.existing === null ? row.added_name : row.name,
          prompt: row.existing === null ? null : row.prompt,
        }),
      ),
    ),
    elements: elements.map((row) => ({
      id: row.id,
      name: row.name,
      groupId: row.group_id,
      registration: row.registration,
    })),
  };
}

/** The project's tree proposal row, if any. */
function treeProposalRow(db: Db, projectId: string) {
  return db
    .selectFrom("detail_proposal")
    .select(["id", "version", "settled_at", "proposer_expert_type"])
    .where("project_id", "=", projectId)
    .where("kind", "=", "tree")
    .executeTakeFirst();
}

/**
 * The tree step for the signed-in member (DT6): the tree now and the proposal with its consent.
 * The facilitator and the members of an architecture group read the answers as counts and
 * objections without names, other participants only their own answer (DT2). Refused with
 * `phase_closed` while the phase hides the step from a participant.
 */
export async function treeBoard(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectResult<TreeBoard>> {
  return readProject(db, userId, projectId, null, async (reader, project) => {
    if (!stepVisible(project.role, project.phase, "details")) return refused("phase_closed");
    const facilitator = project.role === "facilitator";
    const architect =
      !facilitator && (await inExpertGroup(reader, project.id, userId, "architecture"));
    const row = await treeProposalRow(reader, project.id);
    let proposal: TreeProposal | null = null;
    if (row) {
      const me = await actorMemberId(reader, project.id, userId);
      proposal = {
        ...(await consentOf(reader, row, me, facilitator || architect)),
        tree: await proposedTree(reader, row.id),
        proposedBy: row.proposer_expert_type === null ? "facilitator" : "architecture",
      };
    }
    return done({
      current: await currentTree(reader, project.id),
      proposal,
      mayPropose: mayProposeIn(project, architect),
      mayAnswer:
        project.role === "participant" && writeOpen(project.role, project.phase, "detail_answer"),
      open: project.phase === DETAIL_PHASE,
    });
  });
}

/** Where the consent of the tree proposal stands for the reader, without names (DT2). */
async function consentOf(
  db: Db,
  row: { id: string; version: number; settled_at: Date | null },
  me: string | null,
  readsAnswers: boolean,
): Promise<ConsentState> {
  const answers = await db
    .selectFrom("detail_answer")
    .select(["id", "version", "member_id", "answer", "reason", "addressed_note"])
    .where("proposal_id", "=", row.id)
    .orderBy("answered_at")
    .orderBy("id")
    .execute();
  const objection = (answer: (typeof answers)[number]) => ({
    id: answer.id,
    version: answer.version,
    reason: answer.reason ?? "",
    addressedNote: answer.addressed_note,
  });
  const current = answers.filter((answer) => answer.version === row.version);
  const mine = current.find((answer) => answer.member_id === me);
  return {
    id: row.id,
    version: row.version,
    settledAt: row.settled_at?.toISOString() ?? null,
    own: mine && isDetailAnswer(mine.answer) ? { answer: mine.answer, reason: mine.reason } : null,
    answers: readsAnswers
      ? {
          agreed: current.filter((answer) => answer.answer === "agree").length,
          objections: current.filter((answer) => answer.answer === "objection").map(objection),
        }
      : null,
    history: readsAnswers
      ? answers
          .filter((answer) => answer.version < row.version && answer.answer === "objection")
          .map(objection)
      : null,
  };
}

/**
 * Proposes or revises the tree of the model (DT6). The same people and phases as a structure
 * proposal (DT1): the facilitator up to and in the detail phase, a participant of an
 * architecture group in it (`phase_closed`, `detail_not_architect`). Refused with
 * `tree_group_not_found` for a group or parent the project does not have, with
 * `tree_group_name_required` for an added group without a name, with `tree_cycle` when a group
 * would sit inside itself, with `element_not_found` or `detail_not_in_model` for an element
 * outside the model, and with `detail_version_changed` over a version the proposer has not seen.
 * A revision raises the version, so everyone answers again (owner decision 2026-11-23).
 */
export async function proposeTree(
  db: Db,
  userId: string,
  input: ProposeTreeInput,
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

    const existing = new Set(
      (
        await trx
          .selectFrom("element_group")
          .select("id")
          .where("project_id", "=", project.id)
          .execute()
      ).map((row) => row.id),
    );
    // NOTE: no spec governs this, our own design: the tree renames no group of discover, so the
    // name of an existing group stays the facilitator's (EL18).
    const groups = input.groups.map((group) => ({
      ...group,
      name: existing.has(group.id) ? null : group.name,
    }));
    const problem = await treeProblem(trx, project.id, groups);
    if (problem !== null) return refused(problem);
    const placed = new Set([...existing, ...groups.map((group) => group.id)]);
    if (
      input.elements.some((element) => element.groupId !== null && !placed.has(element.groupId))
    ) {
      return refused("tree_group_not_found");
    }
    if (input.elements.length > 0) {
      const found = await trx
        .selectFrom("element")
        .select("id")
        .where("project_id", "=", project.id)
        .where("merged_into", "is", null)
        .where(
          "id",
          "in",
          input.elements.map((element) => element.id),
        )
        .execute();
      if (found.length !== input.elements.length) return refused("element_not_found");
      const inModel = new Set((await modelElements(trx, project.id)).map((row) => row.id));
      if (input.elements.some((element) => !inModel.has(element.id))) {
        return refused("detail_not_in_model");
      }
    }

    const me = await actorMemberId(trx, project.id, userId);
    const fields = {
      proposer_member_id: me,
      proposer_expert_type: project.role === "facilitator" ? null : "architecture",
      proposed_at: new Date(),
      settled_at: null,
    };
    const current = await trx
      .selectFrom("detail_proposal")
      .select(["id", "version"])
      .where("project_id", "=", project.id)
      .where("kind", "=", "tree")
      .forUpdate()
      .executeTakeFirst();
    if ((current?.version ?? 0) !== input.version) return refused("detail_version_changed");
    const saved = current
      ? await trx
          .updateTable("detail_proposal")
          .set({ ...fields, version: current.version + 1 })
          .where("id", "=", current.id)
          .returning(["id", "version"])
          .executeTakeFirstOrThrow()
      : await trx
          .insertInto("detail_proposal")
          .values({ ...fields, kind: "tree", project_id: project.id })
          .returning(["id", "version"])
          .executeTakeFirstOrThrow();
    await trx.deleteFrom("tree_proposal_group").where("proposal_id", "=", saved.id).execute();
    await trx.deleteFrom("tree_proposal_element").where("proposal_id", "=", saved.id).execute();
    if (groups.length > 0) {
      await trx
        .insertInto("tree_proposal_group")
        .values(
          groups.map((group, position) => ({
            proposal_id: saved.id,
            group_id: group.id,
            name: group.name,
            parent_id: group.parentId,
            position,
            min_occurs: group.cardinality?.min ?? null,
            max_occurs: group.cardinality?.max ?? null,
            sub_block: group.subBlock,
            sub_block_title: group.subBlockLink?.title ?? null,
            sub_block_url: group.subBlockLink?.url ?? null,
          })),
        )
        .execute();
    }
    if (input.elements.length > 0) {
      await trx
        .insertInto("tree_proposal_element")
        .values(
          input.elements.map((element) => ({
            proposal_id: saved.id,
            element_id: element.id,
            group_id: element.groupId,
            registration: element.registration,
          })),
        )
        .execute();
    }
    await log(trx, userId, project.id, "tree_proposed", "detail_proposal", saved.id);
    return done({ proposalId: saved.id, version: saved.version });
  });
}

/** The tree for the recap of the detail phase (PR13): the tree now and whether it is settled. */
export async function treeRecap(
  db: Db,
  projectId: string,
): Promise<{ tree: ModelTree; settled: boolean }> {
  const row = await treeProposalRow(db, projectId);
  return { tree: await currentTree(db, projectId), settled: row?.settled_at != null };
}
