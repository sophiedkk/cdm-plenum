// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The first look on real PostgreSQL (EL22, ADR 0020): every refusal per role and phase, and the
// anonymity boundary (EL2, Q-ANON-1): a member reads only their own answers, the facilitator
// counts without names, and no participant ever receives another participant's answer.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { insertElement, insertImportedElement, setPhase } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { answerFirstLook, firstLook, firstLookSummary } from "./first-look.ts";

let db: Kysely<DB>;
let m: ProjectMembers;
let systolic: string;
let diastolic: string;

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "discover");
  systolic = await insertImportedElement(db, m.projectId, "Systolic");
  diastolic = await insertImportedElement(db, m.projectId, "Diastolic");
});

afterEach(async () => {
  await db.destroy();
});

const answer = (
  userId: string,
  elementId: string,
  value: "belongs" | "not_sure" | "not_belongs" = "belongs",
) => answerFirstLook(db, userId, { projectId: m.projectId, elementId, answer: value });

async function lookOf(userId: string) {
  const result = await firstLook(db, userId, m.projectId);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("the first look (EL22)", () => {
  it("lists the elements from existing models with the models they are found in", async () => {
    await insertElement(db, m.projectId, "Brainstormed");
    const look = await lookOf(m.participant);
    expect(look.concept).toBe("Blood pressure");
    expect(look.elements.map((element) => element.name)).toEqual(["Systolic", "Diastolic"]);
    expect(look.elements[0]?.foundIn).toEqual([{ kind: "ckm", title: "Test archetype" }]);
    expect(look.elements.map((element) => element.answer)).toEqual([null, null]);
  });

  it("saves and replaces the member's own answer", async () => {
    expect(await answer(m.participant, systolic, "not_sure")).toEqual({ ok: true, value: null });
    expect(await answer(m.participant, systolic, "belongs")).toEqual({ ok: true, value: null });
    const look = await lookOf(m.participant);
    expect(look.elements.map((element) => element.answer)).toEqual(["belongs", null]);
  });

  it("never gives a participant another participant's answer or identity", async () => {
    await answer(m.otherParticipant, systolic, "not_belongs");
    await answer(m.otherParticipant, diastolic, "not_sure");
    const look = await lookOf(m.participant);
    expect(look.elements.map((element) => element.answer)).toEqual([null, null]);
    expect(personLeaks(look, m)).toEqual([]);
  });

  it("refuses an element that is not from an existing model, or not in the project", async () => {
    const brainstormed = await insertElement(db, m.projectId, "Brainstormed");
    expect(await answer(m.participant, brainstormed)).toEqual({
      ok: false,
      error: "element_not_found",
    });
    expect(await answer(m.participant, "0190a6b1-0000-7000-8000-000000000000")).toEqual({
      ok: false,
      error: "element_not_found",
    });
  });

  it("refuses an outsider", async () => {
    expect(await answer(m.outsider, systolic)).toEqual({ ok: false, error: "not_found" });
    expect(await firstLook(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("closes the first look for a participant outside discover", async () => {
    for (const phase of ["scope", "decide", "handoff"] as const) {
      await setPhase(db, m.projectId, phase);
      expect(await answer(m.participant, systolic)).toEqual({ ok: false, error: "phase_closed" });
      expect(await firstLook(db, m.participant, m.projectId)).toEqual({
        ok: false,
        error: "phase_closed",
      });
      // The facilitator, who prepares ahead elsewhere, answers in discover only too.
      expect(await answer(m.facilitator, systolic)).toEqual({ ok: false, error: "phase_closed" });
    }
    expect(await db.selectFrom("first_look_answer").selectAll().execute()).toEqual([]);
  });
});

describe("the first look summary (EL22)", () => {
  it("counts the answers per element and the participants who finished, without names", async () => {
    await answer(m.participant, systolic, "belongs");
    await answer(m.participant, diastolic, "not_sure");
    await answer(m.otherParticipant, systolic, "not_belongs");
    // The facilitator's own answer stays out of the counts.
    expect(await answer(m.facilitator, systolic, "belongs")).toEqual({ ok: true, value: null });
    const summary = await firstLookSummary(db, m.facilitator, m.projectId);
    if (!summary.ok) throw new Error(summary.error);
    expect(summary.value).toEqual({
      counts: {
        [systolic]: { belongs: 1, not_sure: 0, not_belongs: 1 },
        [diastolic]: { belongs: 0, not_sure: 1, not_belongs: 0 },
      },
      total: 2,
      participants: 2,
      finished: 1,
    });
    expect(personLeaks(summary.value, m)).toEqual([]);
  });

  it("is the facilitator's only", async () => {
    expect(await firstLookSummary(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await firstLookSummary(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
