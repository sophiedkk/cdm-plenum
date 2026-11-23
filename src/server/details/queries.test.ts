// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The structure step of the detail phase on real PostgreSQL (DT1, DT2, ADR 0017): every refusal
// per role and phase, revisions that ask everyone again, settling that copies the structure onto
// the element, and the anonymity boundary (EL2, Q-ANON-1): no answer reaches anyone with a name.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DetailStructure } from "@/lib/details";
import type { ProjectPhase } from "@/lib/project-phases";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
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
  detailBoard,
  detailProgress,
  ownDetailProgress,
  proposeDetail,
  settleDetail,
} from "./queries.ts";

let db: Kysely<DB>;
let m: ProjectMembers;
let architect: string;
let systolic: string;
let diastolic: string;
let cuff: string;

const UNKNOWN_ID = "0190a6b1-0000-7000-8000-000000000000";

const closedRound = (
  projectId: string,
  outcomes: [string, "included" | "excluded" | "no_consensus"][],
) => closedRoundWithOutcomes(db, projectId, outcomes);

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "detail");
  architect = await joinedParticipant(db, m.facilitator, m.projectId, "Architecture", "arch");
  systolic = await insertElement(db, m.projectId, "Systolic");
  diastolic = await insertElement(db, m.projectId, "Diastolic");
  cuff = await insertElement(db, m.projectId, "Cuff size");
  await closedRound(m.projectId, [
    [systolic, "included"],
    [diastolic, "included"],
    [cuff, "excluded"],
  ]);
});

afterEach(async () => {
  await db.destroy();
});

const QUANTITY: DetailStructure = {
  dataType: "quantity",
  cardinality: { min: 1, max: 1 },
  values: [],
};

const CODED: DetailStructure = {
  dataType: "coded_text",
  cardinality: { min: 0, max: 1 },
  values: [
    { text: "Left arm", value: null },
    { text: "Right arm", value: null },
  ],
};

const propose = (
  userId: string,
  elementId: string,
  version = 0,
  structure: DetailStructure = QUANTITY,
) => proposeDetail(db, userId, { projectId: m.projectId, elementId, version, ...structure });

async function proposed(userId: string, elementId: string, version = 0, structure = QUANTITY) {
  const result = await propose(userId, elementId, version, structure);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const answer = (
  userId: string,
  proposal: { proposalId: string; version: number },
  value: "agree" | "objection" = "agree",
  reason: string | null = value === "objection" ? "The unit is missing." : null,
) =>
  answerDetail(db, userId, {
    projectId: m.projectId,
    proposalId: proposal.proposalId,
    version: proposal.version,
    answer: value,
    reason,
  });

const settle = (userId: string, proposal: { proposalId: string; version: number }) =>
  settleDetail(db, userId, {
    projectId: m.projectId,
    proposalId: proposal.proposalId,
    version: proposal.version,
  });

async function boardOf(userId: string) {
  const result = await detailBoard(db, userId, m.projectId);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function elementOf(userId: string, elementId: string) {
  const element = (await boardOf(userId)).elements.find((row) => row.id === elementId);
  if (!element) throw new Error("element not on the detail board");
  return element;
}

async function objectionIds(): Promise<string[]> {
  const element = await elementOf(m.facilitator, systolic);
  return element.proposal?.answers?.objections.map((objection) => objection.id) ?? [];
}

describe("the detail board (DT1)", () => {
  it("lists the elements in the model only, in the order they were added", async () => {
    const board = await boardOf(m.participant);
    expect(board.elements.map((element) => element.name)).toEqual(["Systolic", "Diastolic"]);
    expect(board).toMatchObject({ mayPropose: false, mayAnswer: true, open: true });
  });

  it("lets the facilitator and an architect propose, and only participants answer", async () => {
    expect(await boardOf(m.facilitator)).toMatchObject({ mayPropose: true, mayAnswer: false });
    expect(await boardOf(architect)).toMatchObject({ mayPropose: true, mayAnswer: true });
  });

  it("gives the answers and flags without names, and only to the readers DT2 names", async () => {
    const first = await proposed(m.facilitator, systolic);
    expect(await answer(m.participant, first, "objection")).toEqual({ ok: true, value: null });
    expect(await answer(m.otherParticipant, first)).toEqual({ ok: true, value: null });

    const plain = await elementOf(m.otherParticipant, systolic);
    expect(plain.proposal?.answers).toBeNull();
    expect(plain.proposal?.history).toBeNull();
    expect(plain.flags).toBeNull();
    expect(plain.proposal?.own).toEqual({ answer: "agree", reason: null });

    const facilitatorView = await elementOf(m.facilitator, systolic);
    expect(facilitatorView.proposal?.answers).toMatchObject({
      agreed: 1,
      objections: [{ reason: "The unit is missing.", addressedNote: null }],
    });
    expect(facilitatorView.flags).toEqual([]);
    const architectView = await elementOf(architect, systolic);
    expect(architectView.proposal?.answers?.agreed).toBe(1);
    expect(architectView.flags).toBeNull();

    for (const reader of [m.facilitator, m.participant, architect]) {
      expect(personLeaks(await boardOf(reader), m)).toEqual([]);
    }
  });

  it("refuses an outsider and a participant before the detail phase", async () => {
    expect(await detailBoard(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
    await setPhase(db, m.projectId, "decide");
    expect(await detailBoard(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "phase_closed",
    });
    expect((await boardOf(m.facilitator)).open).toBe(false);
  });
});

describe("proposeDetail (DT1)", () => {
  it("saves a first proposal as version 1 with its values", async () => {
    const saved = await proposed(architect, systolic, 0, CODED);
    expect(saved.version).toBe(1);
    const element = await elementOf(m.participant, systolic);
    expect(element.proposal).toMatchObject({
      version: 1,
      structure: CODED,
      proposedBy: "architecture",
      settledAt: null,
      own: null,
    });
  });

  it("lets the facilitator propose ahead in decide, but nobody after the detail phase", async () => {
    await setPhase(db, m.projectId, "decide");
    expect((await propose(m.facilitator, systolic)).ok).toBe(true);
    expect(await propose(architect, diastolic)).toEqual({ ok: false, error: "phase_closed" });
    await setPhase(db, m.projectId, "handoff");
    expect(await propose(m.facilitator, diastolic)).toEqual({ ok: false, error: "phase_closed" });
  });

  it("refuses a participant outside an architecture group, and an outsider", async () => {
    expect(await propose(m.participant, systolic)).toEqual({
      ok: false,
      error: "detail_not_architect",
    });
    expect(await propose(m.outsider, systolic)).toEqual({ ok: false, error: "not_found" });
  });

  it("refuses an element outside the model, or not in the project", async () => {
    expect(await propose(m.facilitator, cuff)).toEqual({ ok: false, error: "detail_not_in_model" });
    expect(await propose(m.facilitator, UNKNOWN_ID)).toEqual({
      ok: false,
      error: "element_not_found",
    });
    const other = await facilitatorWithProject(db, "fac2");
    const foreign = await insertElement(db, other.projectId, "Foreign");
    expect(await propose(m.facilitator, foreign)).toEqual({
      ok: false,
      error: "element_not_found",
    });
  });

  it("refuses values that do not fit the data type", async () => {
    expect(
      await propose(m.facilitator, systolic, 0, { ...QUANTITY, values: CODED.values }),
    ).toEqual({ ok: false, error: "values_not_allowed" });
  });

  it("refuses a proposal over one the proposer has not seen", async () => {
    await proposed(m.facilitator, systolic);
    expect(await propose(architect, systolic, 0)).toEqual({
      ok: false,
      error: "detail_version_changed",
    });
  });

  it("makes a revision a new version that everyone answers again, keeping old objections", async () => {
    const first = await proposed(m.facilitator, systolic);
    await answer(m.participant, first, "objection");
    await answer(m.otherParticipant, first);
    const [objection] = await objectionIds();
    expect(
      await addressObjection(db, m.facilitator, {
        projectId: m.projectId,
        answerId: objection ?? "",
        note: "Unit added in the next version.",
      }),
    ).toEqual({ ok: true, value: null });
    await settle(m.facilitator, first);

    const second = await proposed(architect, systolic, 1, CODED);
    expect(second.version).toBe(2);
    const view = await elementOf(m.facilitator, systolic);
    expect(view.proposal).toMatchObject({
      version: 2,
      settledAt: null,
      answers: { agreed: 0, objections: [] },
      history: [
        {
          version: 1,
          reason: "The unit is missing.",
          addressedNote: "Unit added in the next version.",
        },
      ],
    });
    expect((await elementOf(m.otherParticipant, systolic)).proposal?.own).toBeNull();
  });
});

describe("answerDetail (DT2)", () => {
  it("replaces the participant's answer to the same version", async () => {
    const first = await proposed(m.facilitator, systolic);
    await answer(m.participant, first, "objection");
    expect(await answer(m.participant, first)).toEqual({ ok: true, value: null });
    expect((await elementOf(m.participant, systolic)).proposal?.own).toEqual({
      answer: "agree",
      reason: null,
    });
  });

  it("refuses the facilitator, an outsider and a participant outside the detail phase", async () => {
    const first = await proposed(m.facilitator, systolic);
    expect(await answer(m.facilitator, first)).toEqual({ ok: false, error: "forbidden" });
    expect(await answer(m.outsider, first)).toEqual({ ok: false, error: "not_found" });
    for (const phase of ["decide", "handoff"] as const satisfies ProjectPhase[]) {
      await setPhase(db, m.projectId, phase);
      expect(await answer(m.participant, first)).toEqual({ ok: false, error: "phase_closed" });
    }
  });

  it("refuses a stale version, a settled proposal and another project's proposal", async () => {
    const first = await proposed(m.facilitator, systolic);
    expect(await answer(m.participant, { ...first, version: 2 })).toEqual({
      ok: false,
      error: "detail_version_changed",
    });
    await settle(m.facilitator, first);
    expect(await answer(m.participant, first)).toEqual({ ok: false, error: "detail_settled" });
    expect(await answer(m.participant, { proposalId: UNKNOWN_ID, version: 1 })).toEqual({
      ok: false,
      error: "detail_proposal_not_found",
    });

    const other = await projectWithMembers(db, "detail");
    const foreignElement = await insertElement(db, other.projectId, "Foreign");
    await closedRound(other.projectId, [[foreignElement, "included"]]);
    const foreign = await proposeDetail(db, other.facilitator, {
      projectId: other.projectId,
      elementId: foreignElement,
      version: 0,
      ...QUANTITY,
    });
    if (!foreign.ok) throw new Error(foreign.error);
    expect(await answer(m.participant, foreign.value)).toEqual({
      ok: false,
      error: "detail_proposal_not_found",
    });
  });
});

describe("addressObjection (DT2)", () => {
  it("refuses a participant, an agree answer and anything outside the detail phase", async () => {
    const first = await proposed(m.facilitator, systolic);
    await answer(m.participant, first, "objection");
    const [objection] = await objectionIds();
    const address = (userId: string, answerId: string) =>
      addressObjection(db, userId, { projectId: m.projectId, answerId, note: "Done." });
    expect(await address(m.participant, objection ?? "")).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await address(m.facilitator, UNKNOWN_ID)).toEqual({
      ok: false,
      error: "detail_answer_not_found",
    });
    await setPhase(db, m.projectId, "handoff");
    expect(await address(m.facilitator, objection ?? "")).toEqual({
      ok: false,
      error: "phase_closed",
    });
  });
});

describe("settleDetail (DT2)", () => {
  it("waits for every objection to be addressed, then copies the structure onto the element", async () => {
    const first = await proposed(architect, systolic, 0, CODED);
    await answer(m.participant, first, "objection");
    expect(await settle(m.facilitator, first)).toEqual({
      ok: false,
      error: "detail_objections_open",
    });
    const [objection] = await objectionIds();
    await addressObjection(db, m.facilitator, {
      projectId: m.projectId,
      answerId: objection ?? "",
      note: "Discussed: the arm is enough.",
    });
    expect(await settle(m.facilitator, first)).toEqual({ ok: true, value: null });

    const element = await db
      .selectFrom("element")
      .select(["data_type", "min_occurs", "max_occurs"])
      .where("id", "=", systolic)
      .executeTakeFirstOrThrow();
    expect(element).toEqual({ data_type: "coded_text", min_occurs: 0, max_occurs: 1 });
    const values = await db
      .selectFrom("element_value")
      .select("text")
      .where("element_id", "=", systolic)
      .orderBy("position")
      .execute();
    expect(values.map((row) => row.text)).toEqual(["Left arm", "Right arm"]);
    expect((await elementOf(m.participant, systolic)).current).toEqual(CODED);
  });

  it("refuses a participant, a stale version and anything outside the detail phase", async () => {
    const first = await proposed(m.facilitator, systolic);
    expect(await settle(architect, first)).toEqual({ ok: false, error: "forbidden" });
    expect(await settle(m.facilitator, { ...first, version: 2 })).toEqual({
      ok: false,
      error: "detail_version_changed",
    });
    await setPhase(db, m.projectId, "decide");
    expect(await settle(m.facilitator, first)).toEqual({ ok: false, error: "phase_closed" });
    await setPhase(db, m.projectId, "detail");
    expect(await settle(m.facilitator, first)).toEqual({ ok: true, value: null });
    expect(await settle(m.facilitator, first)).toEqual({ ok: false, error: "detail_settled" });
  });
});

describe("the counts of the detail phase", () => {
  it("counts proposals, settled elements, open objections and the member's own answers", async () => {
    const first = await proposed(m.facilitator, systolic);
    const second = await proposed(m.facilitator, diastolic);
    await answer(m.participant, first, "objection");
    await answer(m.participant, second);
    await answer(m.otherParticipant, second);
    await settle(m.facilitator, second);
    expect(await detailProgress(db, m.projectId)).toEqual({
      inModel: 2,
      proposed: 2,
      settled: 1,
      openObjections: 1,
    });
    expect(await ownDetailProgress(db, m.projectId, m.participant)).toEqual({
      open: 1,
      answered: 1,
    });
    expect(await ownDetailProgress(db, m.projectId, m.otherParticipant)).toEqual({
      open: 1,
      answered: 0,
    });
  });
});
