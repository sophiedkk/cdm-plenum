// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The tree of the model on real PostgreSQL (DT6, ADR 0021): every refusal per role and phase,
// loops refused, consent on a tree version as in DT2, settling that copies the tree onto the
// groups and elements, the round headings of nested groups (DE19) and the anonymity boundary
// (EL2, Q-ANON-1).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { TreeInput } from "@/lib/model-tree";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { groupsOf } from "../rounds/groups.ts";
import {
  closedRoundWithOutcomes,
  facilitatorWithProject,
  insertElement,
  joinedParticipant,
  setPhase,
} from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import {
  addressObjection,
  answerDetail,
  detailProgress,
  ownDetailProgress,
  proposeDetail,
  settleDetail,
} from "./queries.ts";
import { proposeTree, treeBoard } from "./tree.ts";

let db: Kysely<DB>;
let m: ProjectMembers;
let architect: string;
let systolic: string;
let author: string;
let excluded: string;
/** The starting groups of the project, by brainstorm question (EL18). */
let groups: Record<"recorded" | "patient_state" | "method" | "context", string>;

const ADDED = "0190a6b1-0000-4000-8000-0000000000a1";
const UNKNOWN = "0190a6b1-0000-4000-8000-0000000000ff";

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "detail");
  architect = await joinedParticipant(db, m.facilitator, m.projectId, "Architecture", "arch");
  systolic = await insertElement(db, m.projectId, "Systolic");
  author = await insertElement(db, m.projectId, "Author");
  excluded = await insertElement(db, m.projectId, "Cuff colour");
  await closedRoundWithOutcomes(db, m.projectId, [
    [systolic, "included"],
    [author, "included"],
    [excluded, "excluded"],
  ]);
  const rows = await db
    .selectFrom("element_group")
    .select(["id", "prompt"])
    .where("project_id", "=", m.projectId)
    .execute();
  groups = Object.fromEntries(rows.map((row) => [row.prompt, row.id])) as typeof groups;
});

afterEach(async () => {
  await db.destroy();
});

const group = (
  id: string,
  parentId: string | null,
  extra: Partial<TreeInput["groups"][number]> = {},
): TreeInput["groups"][number] => ({
  id,
  name: null,
  parentId,
  cardinality: null,
  subBlock: false,
  subBlockLink: null,
  ...extra,
});

/** The measurement with "Cuff" added inside it as a linked sub-block, and the author marked. */
const TREE = (): TreeInput => ({
  groups: [
    group(groups.recorded, null, { cardinality: { min: 1, max: 1 } }),
    group(ADDED, groups.recorded, {
      name: "Cuff",
      cardinality: { min: 0, max: 1 },
      subBlock: true,
      subBlockLink: { title: "Cuff cluster", url: "https://models.example.test/cuff" },
    }),
    group(groups.method, groups.recorded),
    group(groups.patient_state, null),
    group(groups.context, null),
  ],
  elements: [
    { id: systolic, groupId: ADDED, registration: false },
    { id: author, groupId: groups.context, registration: true },
  ],
});

const propose = (userId: string, version = 0, tree: TreeInput = TREE()) =>
  proposeTree(db, userId, { projectId: m.projectId, version, ...tree });

async function proposed(userId: string, version = 0, tree: TreeInput = TREE()) {
  const result = await propose(userId, version, tree);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const answer = (
  userId: string,
  proposal: { proposalId: string; version: number },
  value: "agree" | "objection" = "agree",
) =>
  answerDetail(db, userId, {
    projectId: m.projectId,
    proposalId: proposal.proposalId,
    version: proposal.version,
    answer: value,
    reason: value === "objection" ? "The cuff is not a sub-block." : null,
  });

const settle = (userId: string, proposal: { proposalId: string; version: number }) =>
  settleDetail(db, userId, { projectId: m.projectId, ...proposal });

async function boardOf(userId: string) {
  const result = await treeBoard(db, userId, m.projectId);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("the tree board (DT6)", () => {
  it("starts from the groups of discover and the elements in the model", async () => {
    const board = await boardOf(m.participant);
    expect(board.proposal).toBeNull();
    expect(board.current.groups.map((row) => [row.prompt, row.parentId])).toEqual([
      ["recorded", null],
      ["patient_state", null],
      ["method", null],
      ["context", null],
    ]);
    expect(board.current.elements.map((element) => element.name)).toEqual(["Systolic", "Author"]);
    expect(board).toMatchObject({ mayPropose: false, mayAnswer: true, open: true });
  });

  it("lets the facilitator and an architect propose, and only participants answer", async () => {
    expect(await boardOf(m.facilitator)).toMatchObject({ mayPropose: true, mayAnswer: false });
    expect(await boardOf(architect)).toMatchObject({ mayPropose: true, mayAnswer: true });
  });

  it("refuses an outsider, and a participant before the detail phase", async () => {
    expect(await treeBoard(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
    await setPhase(db, m.projectId, "decide");
    expect(await treeBoard(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "phase_closed",
    });
    expect((await boardOf(m.facilitator)).open).toBe(false);
  });
});

describe("what an architect still has to propose (DT1, DT6)", () => {
  it("counts the elements without a structure and the tree until it has a proposal", async () => {
    expect(await ownDetailProgress(db, m.projectId, architect)).toMatchObject({ toPropose: 3 });
    await proposed(architect);
    expect(await ownDetailProgress(db, m.projectId, architect)).toMatchObject({ toPropose: 2 });
    const structure = await proposeDetail(db, architect, {
      projectId: m.projectId,
      elementId: systolic,
      version: 0,
      dataType: "text",
      cardinality: { min: 0, max: 1 },
      units: [],
      values: [],
    });
    expect(structure.ok).toBe(true);
    expect(await ownDetailProgress(db, m.projectId, architect)).toMatchObject({ toPropose: 1 });
  });

  it("counts nothing for a participant outside an architecture group", async () => {
    expect(await ownDetailProgress(db, m.projectId, m.participant)).toMatchObject({
      toPropose: 0,
    });
  });
});

describe("proposeTree (DT6)", () => {
  it("saves the nested groups, the sub-block and the registration element as version 1", async () => {
    expect((await proposed(architect)).version).toBe(1);
    const proposal = (await boardOf(m.participant)).proposal;
    expect(proposal).toMatchObject({ version: 1, proposedBy: "architecture", settledAt: null });
    expect(
      proposal?.tree.groups.map((row) => [row.name ?? row.prompt, row.parentId, row.subBlock]),
    ).toEqual([
      ["recorded", null, false],
      ["Cuff", groups.recorded, true],
      ["method", groups.recorded, false],
      ["patient_state", null, false],
      ["context", null, false],
    ]);
    expect(proposal?.tree.groups[1]).toMatchObject({
      cardinality: { min: 0, max: 1 },
      subBlockLink: { title: "Cuff cluster", url: "https://models.example.test/cuff" },
    });
    expect(proposal?.tree.elements).toEqual([
      { id: systolic, name: "Systolic", groupId: ADDED, registration: false },
      { id: author, name: "Author", groupId: groups.context, registration: true },
    ]);
    // Nothing changes on the groups before the facilitator settles.
    expect((await boardOf(m.participant)).current.groups.every((row) => !row.parentId)).toBe(true);
  });

  it("lets the facilitator propose ahead in decide, but nobody after the detail phase", async () => {
    await setPhase(db, m.projectId, "decide");
    expect((await propose(m.facilitator)).ok).toBe(true);
    expect(await propose(architect, 1)).toEqual({ ok: false, error: "phase_closed" });
    await setPhase(db, m.projectId, "handoff");
    expect(await propose(m.facilitator, 1)).toEqual({ ok: false, error: "phase_closed" });
  });

  it("refuses a participant outside an architecture group, and an outsider", async () => {
    expect(await propose(m.participant)).toEqual({ ok: false, error: "detail_not_architect" });
    expect(await propose(m.outsider)).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses a group that sits inside itself, directly or through another group", async () => {
    const loop: TreeInput = {
      groups: [group(groups.recorded, groups.method), group(groups.method, groups.recorded)],
      elements: [],
    };
    expect(await propose(architect, 0, loop)).toEqual({ ok: false, error: "tree_cycle" });
    const self: TreeInput = { groups: [group(groups.recorded, groups.recorded)], elements: [] };
    expect(await propose(architect, 0, self)).toEqual({ ok: false, error: "tree_cycle" });
  });

  it("refuses a loop with a group the proposal leaves where it is", async () => {
    await db
      .updateTable("element_group")
      .set({ parent_id: groups.recorded })
      .where("id", "=", groups.method)
      .execute();
    const loop: TreeInput = { groups: [group(groups.recorded, groups.method)], elements: [] };
    expect(await propose(architect, 0, loop)).toEqual({ ok: false, error: "tree_cycle" });
  });

  it("refuses a group or parent the project does not have, and an added group without a name", async () => {
    const other = await facilitatorWithProject(db, "fac2");
    const foreign = await db
      .selectFrom("element_group")
      .select("id")
      .where("project_id", "=", other.projectId)
      .executeTakeFirstOrThrow();
    for (const tree of [
      { groups: [group(groups.recorded, UNKNOWN)], elements: [] },
      { groups: [group(foreign.id, null, { name: "Taken" })], elements: [] },
      { groups: [], elements: [{ id: systolic, groupId: UNKNOWN, registration: false }] },
    ]) {
      expect(await propose(architect, 0, tree)).toEqual({
        ok: false,
        error: "tree_group_not_found",
      });
    }
    expect(await propose(architect, 0, { groups: [group(ADDED, null)], elements: [] })).toEqual({
      ok: false,
      error: "tree_group_name_required",
    });
  });

  it("refuses an element outside the model, or not in the project", async () => {
    const outside = { id: excluded, groupId: null, registration: true };
    expect(await propose(architect, 0, { groups: [], elements: [outside] })).toEqual({
      ok: false,
      error: "detail_not_in_model",
    });
    const unknown = { id: UNKNOWN, groupId: null, registration: true };
    expect(await propose(architect, 0, { groups: [], elements: [unknown] })).toEqual({
      ok: false,
      error: "element_not_found",
    });
  });

  it("keeps the name of a group of discover, and refuses a version the proposer has not seen", async () => {
    const renamed: TreeInput = {
      groups: [group(groups.recorded, null, { name: "Renamed" })],
      elements: [],
    };
    await proposed(m.facilitator, 0, renamed);
    const proposal = (await boardOf(m.facilitator)).proposal;
    expect(proposal?.tree.groups[0]).toMatchObject({ name: null, prompt: "recorded" });
    expect(await propose(architect, 0)).toEqual({ ok: false, error: "detail_version_changed" });
  });
});

describe("consent on the tree (DT2)", () => {
  it("lets participants answer, the facilitator address and settle, copying the tree", async () => {
    const first = await proposed(architect);
    expect(await answer(m.participant, first, "objection")).toEqual({ ok: true, value: null });
    expect(await answer(m.otherParticipant, first)).toEqual({ ok: true, value: null });
    expect(await answer(m.facilitator, first)).toEqual({ ok: false, error: "forbidden" });
    expect(await settle(m.facilitator, first)).toEqual({
      ok: false,
      error: "detail_objections_open",
    });
    expect(await detailProgress(db, m.projectId)).toMatchObject({ openObjections: 1 });

    const objections = (await boardOf(m.facilitator)).proposal?.answers?.objections ?? [];
    expect(objections).toEqual([
      expect.objectContaining({ reason: "The cuff is not a sub-block.", addressedNote: null }),
    ]);
    expect(
      await addressObjection(db, m.facilitator, {
        projectId: m.projectId,
        answerId: objections[0]?.id ?? "",
        note: "A cuff is reused across blood pressure models.",
      }),
    ).toEqual({ ok: true, value: null });
    expect(await settle(architect, first)).toEqual({ ok: false, error: "forbidden" });
    expect(await settle(m.facilitator, first)).toEqual({ ok: true, value: null });
    expect(await answer(m.participant, first)).toEqual({ ok: false, error: "detail_settled" });

    const cuff = await db
      .selectFrom("element_group")
      .selectAll()
      .where("id", "=", ADDED)
      .executeTakeFirstOrThrow();
    expect(cuff).toMatchObject({
      project_id: m.projectId,
      name: "Cuff",
      parent_id: groups.recorded,
      min_occurs: 0,
      max_occurs: 1,
      sub_block: true,
      sub_block_title: "Cuff cluster",
      sub_block_url: "https://models.example.test/cuff",
    });
    const method = await db
      .selectFrom("element_group")
      .select(["parent_id", "position"])
      .where("id", "=", groups.method)
      .executeTakeFirstOrThrow();
    expect(method).toEqual({ parent_id: groups.recorded, position: 2 });
    const elements = await db
      .selectFrom("element")
      .select(["id", "group_id", "registration"])
      .where("id", "in", [systolic, author, excluded])
      .orderBy("name")
      .execute();
    expect(elements).toEqual([
      { id: author, group_id: groups.context, registration: true },
      { id: excluded, group_id: null, registration: false },
      { id: systolic, group_id: ADDED, registration: false },
    ]);
    const board = await boardOf(m.participant);
    expect(board.proposal?.settledAt).not.toBeNull();
    expect(board.current.groups.find((row) => row.id === ADDED)?.parentId).toBe(groups.recorded);
  });

  it("refuses the tree proposal of another project to answer or settle", async () => {
    const other = await facilitatorWithProject(db, "fac2");
    const foreign = await db
      .insertInto("detail_proposal")
      .values({ kind: "tree", project_id: other.projectId })
      .returning(["id as proposalId", "version"])
      .executeTakeFirstOrThrow();
    expect(await answer(m.participant, foreign)).toEqual({
      ok: false,
      error: "detail_proposal_not_found",
    });
    expect(await settle(m.facilitator, foreign)).toEqual({
      ok: false,
      error: "detail_proposal_not_found",
    });
  });

  it("makes a revision a new version that everyone answers again, keeping old objections", async () => {
    const first = await proposed(architect);
    await answer(m.participant, first, "objection");
    expect(await ownDetailProgress(db, m.projectId, m.participant)).toMatchObject({
      open: 1,
      answered: 1,
    });
    const second = await proposed(m.facilitator, 1);
    expect(second.version).toBe(2);
    expect(await answer(m.participant, first)).toEqual({
      ok: false,
      error: "detail_version_changed",
    });
    const view = (await boardOf(architect)).proposal;
    expect(view).toMatchObject({
      version: 2,
      proposedBy: "facilitator",
      own: null,
      answers: { agreed: 0, objections: [] },
      history: [expect.objectContaining({ version: 1, reason: "The cuff is not a sub-block." })],
    });
    expect(await ownDetailProgress(db, m.projectId, m.participant)).toMatchObject({
      open: 1,
      answered: 0,
    });
  });

  it("refuses to settle a tree whose groups since closed a loop", async () => {
    const first = await proposed(architect, 0, {
      groups: [group(groups.recorded, groups.method)],
      elements: [],
    });
    await db
      .updateTable("element_group")
      .set({ parent_id: groups.recorded })
      .where("id", "=", groups.method)
      .execute();
    expect(await settle(m.facilitator, first)).toEqual({ ok: false, error: "tree_cycle" });
  });

  it("gives the answers without names, and only to the readers DT2 names", async () => {
    const first = await proposed(architect);
    await answer(m.participant, first, "objection");
    await answer(m.otherParticipant, first);
    const plain = (await boardOf(m.otherParticipant)).proposal;
    expect(plain?.answers).toBeNull();
    expect(plain?.history).toBeNull();
    expect(plain?.own).toEqual({ answer: "agree", reason: null });
    expect((await boardOf(m.facilitator)).proposal?.answers?.agreed).toBe(1);
    for (const reader of [m.facilitator, m.participant, m.otherParticipant, architect]) {
      expect(personLeaks(await boardOf(reader), m)).toEqual([]);
    }
  });
});

describe("the tree in the database", () => {
  it("refuses a loop and a parent in another project", async () => {
    await db
      .updateTable("element_group")
      .set({ parent_id: groups.recorded })
      .where("id", "=", groups.method)
      .execute();
    const parentOf = (id: string, parentId: string) =>
      db
        .transaction()
        .execute((trx) =>
          trx
            .updateTable("element_group")
            .set({ parent_id: parentId })
            .where("id", "=", id)
            .execute(),
        );
    await expect(parentOf(groups.recorded, groups.method)).rejects.toThrow("group_cycle");
    const other = await facilitatorWithProject(db, "fac2");
    const foreign = await db
      .selectFrom("element_group")
      .select("id")
      .where("project_id", "=", other.projectId)
      .executeTakeFirstOrThrow();
    await expect(parentOf(groups.context, foreign.id)).rejects.toThrow("group_parent_elsewhere");
  });
});

describe("round headings of nested groups (DE19)", () => {
  it("names the group at the top of the model that holds the element's group", async () => {
    await proposed(m.facilitator);
    const first = (await boardOf(m.facilitator)).proposal;
    await settle(m.facilitator, { proposalId: first?.id ?? "", version: 1 });
    const placed = await groupsOf(db, [systolic, author, excluded]);
    expect(placed.get(systolic)).toMatchObject({ id: groups.recorded, prompt: "recorded" });
    expect(placed.get(author)).toMatchObject({ id: groups.context, prompt: "context" });
    expect(placed.has(excluded)).toBe(false);
  });
});
