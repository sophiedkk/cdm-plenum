// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The terminology step of the detail phase on real PostgreSQL (DT4, DT5, ADR 0017): codes follow
// a settled structure, a second terminologist's review gates the group's answers, the facilitator
// skips the review only without another terminologist, settling copies the codes onto the
// element, and a new structure reopens them. No answer or review reaches anyone with a name.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DetailCode, DetailStructure } from "@/lib/details";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import {
  closedRoundWithOutcomes,
  insertElement,
  joinedParticipant,
  setPhase,
} from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import {
  answerDetail,
  detailBoard,
  detailProgress,
  ownDetailProgress,
  proposeDetail,
  settleDetail,
} from "./queries.ts";
import { proposeCodes, reviewCodes, skipReview } from "./terminology.ts";

let db: Kysely<DB>;
let m: ProjectMembers;
let terminologist: string;
let reviewer: string;
let systolic: string;
let cuff: string;

const SNOMED = "http://snomed.info/sct";
const CODED: DetailStructure = {
  dataType: "coded_text",
  cardinality: { min: 0, max: 1 },
  units: [],
  values: [
    { text: "Left arm", value: null },
    { text: "Right arm", value: null },
  ],
};
const LEFT: DetailCode = { system: SNOMED, code: "368208006", display: "Left upper arm" };
const RIGHT: DetailCode = { system: SNOMED, code: "368209003", display: "Right upper arm" };
const ELEMENT_CODE: DetailCode = { system: "http://loinc.org", code: "8480-6", display: null };

type Ref = { proposalId: string; version: number };

function must<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function settledStructure(elementId: string, version = 0): Promise<Ref> {
  const proposal = must(
    await proposeDetail(db, m.facilitator, {
      projectId: m.projectId,
      elementId,
      version,
      ...CODED,
    }),
  );
  must(await settleDetail(db, m.facilitator, { projectId: m.projectId, ...proposal }));
  return proposal;
}

const propose = (
  userId: string,
  version = 0,
  valueCodes: (DetailCode | null)[] = [LEFT, RIGHT],
  elementId = systolic,
) =>
  proposeCodes(db, userId, {
    projectId: m.projectId,
    elementId,
    version,
    code: ELEMENT_CODE,
    bindingStrength: "extensible",
    valueSetUrl: null,
    valueCodes,
  });

const review = (userId: string, ref: Ref, decision: "approve" | "return" = "approve") =>
  reviewCodes(db, userId, {
    projectId: m.projectId,
    ...ref,
    decision,
    note: decision === "return" ? "Use the body structure codes." : null,
  });

const answer = (userId: string, ref: Ref) =>
  answerDetail(db, userId, {
    projectId: m.projectId,
    ...ref,
    answer: "agree",
    reason: null,
  });

const settle = (userId: string, ref: Ref) =>
  settleDetail(db, userId, { projectId: m.projectId, ...ref });

async function codesOf(userId: string) {
  const board = must(await detailBoard(db, userId, m.projectId));
  const element = board.elements.find((row) => row.id === systolic);
  if (!element) throw new Error("element not on the board");
  return element;
}

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "detail");
  terminologist = await joinedParticipant(db, m.facilitator, m.projectId, "Terminology", "term");
  reviewer = await joinedParticipant(db, m.facilitator, m.projectId, "Terminology", "term2");
  systolic = await insertElement(db, m.projectId, "Measurement site");
  cuff = await insertElement(db, m.projectId, "Cuff size");
  await closedRoundWithOutcomes(db, m.projectId, [
    [systolic, "included"],
    [cuff, "excluded"],
  ]);
});

afterEach(async () => {
  await db.destroy();
});

describe("the codes a terminologist still has to propose (DT4)", () => {
  it("counts the elements with a settled structure and no code proposal", async () => {
    expect(await ownDetailProgress(db, m.projectId, terminologist)).toMatchObject({
      toProposeCodes: 0,
    });
    await settledStructure(systolic);
    expect(await ownDetailProgress(db, m.projectId, terminologist)).toMatchObject({
      toProposeCodes: 1,
    });
    must(await propose(terminologist));
    expect(await ownDetailProgress(db, m.projectId, terminologist)).toMatchObject({
      toProposeCodes: 0,
    });
  });

  it("counts nothing for a participant outside a terminology group, and no structures", async () => {
    await settledStructure(systolic);
    expect(await ownDetailProgress(db, m.projectId, m.participant)).toMatchObject({
      toProposeCodes: 0,
      toPropose: 0,
    });
  });
});

describe("proposeCodes (DT4, DT5)", () => {
  it("waits for a settled structure, then takes one entry per value", async () => {
    expect(await propose(terminologist)).toEqual({ ok: false, error: "detail_structure_open" });
    await settledStructure(systolic);
    expect(await propose(terminologist, 0, [LEFT])).toEqual({
      ok: false,
      error: "detail_value_codes_mismatch",
    });
    expect(must(await propose(terminologist, 0, [LEFT, null]))).toMatchObject({ version: 1 });
    const element = await codesOf(terminologist);
    expect(element.codes).toMatchObject({
      version: 1,
      proposedBy: "terminology",
      codes: {
        code: ELEMENT_CODE,
        bindingStrength: "extensible",
        valueSetUrl: null,
        valueCodes: [LEFT, null],
      },
      review: { state: "pending", ownProposal: true },
    });
  });

  it("refuses a non-terminologist, an element outside the model and a stale version", async () => {
    await settledStructure(systolic);
    expect(await propose(m.participant)).toEqual({
      ok: false,
      error: "detail_not_terminologist",
    });
    expect(await propose(m.outsider)).toEqual({ ok: false, error: "not_found" });
    expect(await propose(m.facilitator, 0, [], cuff)).toEqual({
      ok: false,
      error: "detail_not_in_model",
    });
    must(await propose(terminologist));
    expect(await propose(m.facilitator, 0)).toEqual({
      ok: false,
      error: "detail_version_changed",
    });
  });

  it("closes for a participant outside the detail phase, and for everyone after it", async () => {
    await settledStructure(systolic);
    await setPhase(db, m.projectId, "handoff");
    expect(await propose(terminologist)).toEqual({ ok: false, error: "phase_closed" });
    expect(await propose(m.facilitator)).toEqual({ ok: false, error: "phase_closed" });
  });
});

describe("the review gate (DT4)", () => {
  it("hides codes in review from other participants and refuses their answers", async () => {
    await settledStructure(systolic);
    const ref = must(await propose(terminologist));
    const plain = await codesOf(m.participant);
    expect(plain.codes).toBeNull();
    expect(plain.codesInReview).toBe(true);
    expect((await codesOf(reviewer)).codes?.review.ownProposal).toBe(false);
    expect(await answer(m.participant, ref)).toEqual({ ok: false, error: "detail_not_reviewed" });
    expect(await settle(m.facilitator, ref)).toEqual({ ok: false, error: "detail_not_reviewed" });
    for (const reader of [m.facilitator, m.participant, reviewer]) {
      expect(personLeaks(must(await detailBoard(db, reader, m.projectId)), m)).toEqual([]);
    }
  });

  it("lets only another terminologist review, in the detail phase", async () => {
    await settledStructure(systolic);
    const ref = must(await propose(terminologist));
    expect(await review(terminologist, ref)).toEqual({ ok: false, error: "detail_review_own" });
    expect(await review(m.participant, ref)).toEqual({
      ok: false,
      error: "detail_not_terminologist",
    });
    expect(await review(m.facilitator, ref)).toEqual({ ok: false, error: "forbidden" });
    expect(await review(reviewer, { ...ref, version: 2 })).toEqual({
      ok: false,
      error: "detail_version_changed",
    });
    await setPhase(db, m.projectId, "handoff");
    expect(await review(reviewer, ref)).toEqual({ ok: false, error: "phase_closed" });
  });

  it("sends returned codes back for a new version that waits for review again", async () => {
    await settledStructure(systolic);
    const first = must(await propose(terminologist));
    expect(await review(reviewer, first, "return")).toEqual({ ok: true, value: null });
    expect((await codesOf(terminologist)).codes?.review).toMatchObject({
      state: "returned",
      note: "Use the body structure codes.",
    });
    expect(await review(reviewer, first)).toEqual({
      ok: false,
      error: "detail_review_not_pending",
    });
    const second = must(await propose(terminologist, 1));
    expect((await codesOf(terminologist)).codes?.review.state).toBe("pending");
    expect(await review(reviewer, second)).toEqual({ ok: true, value: null });
    expect(await answer(m.participant, second)).toEqual({ ok: true, value: null });
  });
});

describe("skipReview (DT4)", () => {
  it("refuses while another terminologist can review, and a participant", async () => {
    await settledStructure(systolic);
    const ref = must(await propose(terminologist));
    const skip = (userId: string) =>
      skipReview(db, userId, { projectId: m.projectId, ...ref, reason: "Only one terminologist." });
    expect(await skip(m.facilitator)).toEqual({ ok: false, error: "detail_review_possible" });
    expect(await skip(terminologist)).toEqual({ ok: false, error: "forbidden" });
  });

  it("lets the facilitator skip with a reason when nobody else can review", async () => {
    await db.deleteFrom("teamMember").where("userId", "=", reviewer).execute();
    await settledStructure(systolic);
    const ref = must(await propose(terminologist));
    expect((await codesOf(m.facilitator)).codes?.review.skippable).toBe(true);
    expect(
      await skipReview(db, m.facilitator, {
        projectId: m.projectId,
        ...ref,
        reason: "The project has one terminologist.",
      }),
    ).toEqual({ ok: true, value: null });
    expect((await codesOf(m.participant)).codes?.review).toMatchObject({
      state: "skipped",
      note: null,
    });
    expect(await answer(m.participant, ref)).toEqual({ ok: true, value: null });
  });
});

describe("settling codes (DT5)", () => {
  it("copies the element code, the binding and the value codes onto the element", async () => {
    await settledStructure(systolic);
    const ref = must(await propose(terminologist, 0, [LEFT, null]));
    must(await review(reviewer, ref));
    must(await answer(m.participant, ref));
    expect(await settle(m.facilitator, ref)).toEqual({ ok: true, value: null });
    const element = await db
      .selectFrom("element")
      .select(["code_system", "code", "binding_strength"])
      .where("id", "=", systolic)
      .executeTakeFirstOrThrow();
    expect(element).toEqual({
      code_system: "http://loinc.org",
      code: "8480-6",
      binding_strength: "extensible",
    });
    expect((await codesOf(m.participant)).currentCodes.valueCodes).toEqual([LEFT, null]);
    expect(await detailProgress(db, m.projectId)).toMatchObject({ codesSettled: 1 });
  });

  it("reopens settled codes when the structure is revised", async () => {
    const structure = await settledStructure(systolic);
    const ref = must(await propose(terminologist));
    must(await review(reviewer, ref));
    must(await settle(m.facilitator, ref));
    must(
      await proposeDetail(db, m.facilitator, {
        projectId: m.projectId,
        elementId: systolic,
        version: structure.version,
        ...CODED,
      }),
    );
    expect((await codesOf(m.facilitator)).codes).toMatchObject({
      settledAt: null,
      review: { state: "returned", note: null },
    });
    expect(await settle(m.facilitator, ref)).toEqual({ ok: false, error: "detail_not_reviewed" });
  });

  it("counts the reviews that wait for a terminologist", async () => {
    await settledStructure(systolic);
    must(await propose(terminologist));
    expect(await ownDetailProgress(db, m.projectId, reviewer)).toEqual({
      open: 0,
      answered: 0,
      toReview: 1,
      toPropose: 0,
      toProposeCodes: 0,
    });
    expect(await ownDetailProgress(db, m.projectId, terminologist)).toMatchObject({
      toReview: 0,
    });
  });
});
