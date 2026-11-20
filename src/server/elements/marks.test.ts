// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// "I support this" and "same as" on real PostgreSQL (EL16): every refusal, and anonymity per role
// (EL2, Q-ANON-1): a participant reads their own marks only, the facilitator counts without names.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { facilitatorWithProject, insertElement, setPhase } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { revealBoard, setPrivateBrainstorm } from "./brainstorm.ts";
import { addSameAs, listOwnMarks, markSummary, removeSameAs, setSupport } from "./marks.ts";
import { listElements, mergeElements } from "./queries.ts";

let db: Kysely<DB>;
let m: ProjectMembers;
let x: string;
let y: string;
let z: string;

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "discover");
  x = await insertElement(db, m.projectId, "Heart rate");
  y = await insertElement(db, m.projectId, "Pulse rate");
  z = await insertElement(db, m.projectId, "Rhythm");
});

afterEach(async () => {
  await db.destroy();
});

async function reveal(): Promise<void> {
  const revealed = await revealBoard(db, m.facilitator, m.projectId);
  if (!revealed.ok) throw new Error(revealed.error);
}

const support = (userId: string, elementId: string, supported = true) =>
  setSupport(db, userId, { projectId: m.projectId, elementId, supported });
const sameAs = (userId: string, elementId: string, sameAsId: string) =>
  addSameAs(db, userId, { projectId: m.projectId, elementId, sameAsId });
const notSameAs = (userId: string, elementId: string, sameAsId: string) =>
  removeSameAs(db, userId, { projectId: m.projectId, elementId, sameAsId });

async function summary() {
  const result = await markSummary(db, m.facilitator, m.projectId);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("refusals (EL16)", () => {
  it("refuses every mark before the reveal, for a participant and the facilitator", async () => {
    for (const userId of [m.participant, m.facilitator]) {
      expect(await support(userId, x)).toEqual({ ok: false, error: "marks_before_reveal" });
      expect(await sameAs(userId, x, y)).toEqual({ ok: false, error: "marks_before_reveal" });
      expect(await notSameAs(userId, x, y)).toEqual({ ok: false, error: "marks_before_reveal" });
    }
    expect(await db.selectFrom("element_support").selectAll().execute()).toEqual([]);
  });

  it("takes marks without a reveal when the private step is off (EL13)", async () => {
    const off = await setPrivateBrainstorm(db, m.facilitator, {
      projectId: m.projectId,
      enabled: false,
    });
    expect(off.ok).toBe(true);
    expect(await support(m.participant, x)).toEqual({ ok: true, value: null });
  });

  it("refuses marks outside the discover phase, for a participant and the facilitator", async () => {
    await reveal();
    await setPhase(db, m.projectId, "decide");
    for (const userId of [m.participant, m.facilitator]) {
      expect(await support(userId, x)).toEqual({ ok: false, error: "phase_closed" });
      expect(await sameAs(userId, x, y)).toEqual({ ok: false, error: "phase_closed" });
      expect(await notSameAs(userId, x, y)).toEqual({ ok: false, error: "phase_closed" });
    }
    await setPhase(db, m.projectId, "scope");
    expect(await support(m.facilitator, x)).toEqual({ ok: false, error: "phase_closed" });
    // Before the board's step a participant finds no element at all (PR9).
    expect(await support(m.participant, x)).toEqual({ ok: false, error: "element_not_found" });
  });

  it("refuses a merged element as the element and as the duplicate", async () => {
    await reveal();
    const merged = await mergeElements(db, m.facilitator, {
      projectId: m.projectId,
      intoId: x,
      fromIds: [y],
    });
    expect(merged.ok).toBe(true);
    expect(await support(m.participant, y)).toEqual({ ok: false, error: "element_not_found" });
    expect(await sameAs(m.participant, y, z)).toEqual({ ok: false, error: "element_not_found" });
    expect(await sameAs(m.participant, z, y)).toEqual({ ok: false, error: "element_not_found" });
  });

  it("refuses an element of another project", async () => {
    await reveal();
    const other = await facilitatorWithProject(db, "fac2");
    const foreign = await insertElement(db, other.projectId, "Foreign");
    expect(await support(m.participant, foreign)).toEqual({
      ok: false,
      error: "element_not_found",
    });
    expect(await sameAs(m.participant, x, foreign)).toEqual({
      ok: false,
      error: "element_not_found",
    });
  });

  it("refuses an element marked as the same as itself", async () => {
    await reveal();
    expect(await sameAs(m.participant, x, x)).toEqual({ ok: false, error: "same_as_itself" });
    expect(await db.selectFrom("element_same_as").selectAll().execute()).toEqual([]);
  });

  it("refuses a user who is no member", async () => {
    await reveal();
    expect(await support(m.outsider, x)).toEqual({ ok: false, error: "not_found" });
    expect(await sameAs(m.outsider, x, y)).toEqual({ ok: false, error: "not_found" });
    expect(await notSameAs(m.outsider, x, y)).toEqual({ ok: false, error: "not_found" });
    expect(await listOwnMarks(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await markSummary(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("refuses the counts to a participant", async () => {
    await reveal();
    expect(await markSummary(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("the database (EL16)", () => {
  it("never stores an element as the same as itself or a pair twice per member", async () => {
    const member = m.memberIds[0] ?? "";
    await expect(
      db
        .transaction()
        .execute((trx) =>
          trx
            .insertInto("element_same_as")
            .values({ element_id: x, same_as_id: x, member_id: member })
            .execute(),
        ),
    ).rejects.toThrow(/element_same_as_not_itself/);
    await db
      .insertInto("element_same_as")
      .values({ element_id: x, same_as_id: y, member_id: member })
      .execute();
    await expect(
      db
        .transaction()
        .execute((trx) =>
          trx
            .insertInto("element_same_as")
            .values({ element_id: y, same_as_id: x, member_id: member })
            .execute(),
        ),
    ).rejects.toThrow(/element_same_as_pair_unique/);
  });
});

describe("marks (EL16)", () => {
  beforeEach(reveal);

  it("toggles the member's support and keeps one mark when set twice", async () => {
    await support(m.participant, x);
    await support(m.participant, x);
    expect(await listOwnMarks(db, m.participant, m.projectId)).toEqual({
      ok: true,
      value: { supported: [x], sameAs: [] },
    });
    expect((await summary()).support).toEqual({ [x]: 1 });
    await support(m.participant, x, false);
    expect(await listOwnMarks(db, m.participant, m.projectId)).toEqual({
      ok: true,
      value: { supported: [], sameAs: [] },
    });
    expect((await summary()).support).toEqual({});
  });

  it("counts a pair once per member in either order and removes it in either order", async () => {
    await sameAs(m.participant, x, y);
    await sameAs(m.participant, y, x);
    await sameAs(m.otherParticipant, y, x);
    await sameAs(m.facilitator, x, z);
    expect((await summary()).duplicates).toEqual([
      { elementIds: [x, y], count: 2 },
      { elementIds: [x, z], count: 1 },
    ]);
    expect(await listOwnMarks(db, m.participant, m.projectId)).toEqual({
      ok: true,
      value: { supported: [], sameAs: [{ elementId: x, sameAsId: y }] },
    });
    expect(await notSameAs(m.participant, y, x)).toEqual({ ok: true, value: null });
    expect((await summary()).duplicates).toEqual([
      { elementIds: [x, y], count: 1 },
      { elementIds: [x, z], count: 1 },
    ]);
  });

  it("moves the support of a duplicate to the merge result and ends its proposals", async () => {
    await support(m.participant, x);
    await support(m.participant, y);
    await support(m.otherParticipant, y);
    await sameAs(m.participant, x, y);
    await sameAs(m.participant, y, z);
    const merged = await mergeElements(db, m.facilitator, {
      projectId: m.projectId,
      intoId: x,
      fromIds: [y],
    });
    expect(merged.ok).toBe(true);
    expect(await summary()).toEqual({ support: { [x]: 2 }, duplicates: [] });
    expect(await listOwnMarks(db, m.participant, m.projectId)).toEqual({
      ok: true,
      value: { supported: [x], sameAs: [] },
    });
  });
});

describe("anonymity (EL2, Q-ANON-1)", () => {
  beforeEach(reveal);

  it("gives participant B none of participant A's marks", async () => {
    await support(m.participant, x);
    await sameAs(m.participant, x, y);
    const responses = [
      await listOwnMarks(db, m.otherParticipant, m.projectId),
      await listElements(db, m.otherParticipant, m.projectId),
    ];
    expect(responses[0]).toEqual({ ok: true, value: { supported: [], sameAs: [] } });
    expect(JSON.stringify(responses[1])).not.toMatch(/support|sameAs/i);
    for (const response of responses) expect(personLeaks(response, m)).toEqual([]);
  });

  it("gives the facilitator counts without names", async () => {
    await support(m.participant, x);
    await support(m.otherParticipant, x);
    await sameAs(m.participant, x, y);
    const result = await markSummary(db, m.facilitator, m.projectId);
    expect(result).toEqual({
      ok: true,
      value: { support: { [x]: 2 }, duplicates: [{ elementIds: [x, y], count: 1 }] },
    });
    expect(personLeaks(result, m)).toEqual([]);
  });

  it("gives a participant before the board's step no marks", async () => {
    await support(m.participant, x);
    await setPhase(db, m.projectId, "scope");
    expect(await listOwnMarks(db, m.participant, m.projectId)).toEqual({
      ok: true,
      value: { supported: [], sameAs: [] },
    });
  });
});
