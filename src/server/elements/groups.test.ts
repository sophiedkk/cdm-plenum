// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The grouping and the check of it on real PostgreSQL (EL18, EL24, ADR 0020): where elements
// start, every refusal per role and phase, and the anonymity boundary (EL2, Q-ANON-1): a
// participant reads only their own remarks, the facilitator counts and texts without names.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { insertElement, setPhase } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { revealBoard } from "./brainstorm.ts";
import {
  addElementGroup,
  addGroupMissing,
  askGroupCheck,
  finishGroupCheck,
  groupCheck,
  groupingBoard,
  moveElement,
  renameElementGroup,
  setElsewhere,
} from "./groups.ts";
import { addElement } from "./queries.ts";
import { addElementInput } from "./schemas.ts";

let db: Kysely<DB>;
let m: ProjectMembers;
let systolic: string;
let position: string;
let csv: string;

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "discover");
  systolic = await add(m.participant, "Systolic", "recorded");
  position = await add(m.otherParticipant, "Position", "patient_state");
  csv = await insertElement(db, m.projectId, "Observer");
});

afterEach(async () => {
  await db.destroy();
});

async function add(
  userId: string,
  name: string,
  prompt: "recorded" | "patient_state" | "method" | "context",
): Promise<string> {
  const added = await addElement(
    db,
    userId,
    addElementInput.parse({ projectId: m.projectId, name, prompt }),
  );
  if (!added.ok) throw new Error(added.error);
  return added.value.elementId;
}

async function board() {
  const result = await groupingBoard(db, m.facilitator, m.projectId);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

async function groupIdOf(prompt: string): Promise<string> {
  const row = await db
    .selectFrom("element_group")
    .select("id")
    .where("project_id", "=", m.projectId)
    .where("prompt", "=", prompt)
    .executeTakeFirstOrThrow();
  return row.id;
}

async function asked(): Promise<void> {
  const revealed = await revealBoard(db, m.facilitator, m.projectId);
  if (!revealed.ok) throw new Error(revealed.error);
  const result = await askGroupCheck(db, m.facilitator, m.projectId);
  if (!result.ok) throw new Error(result.error);
}

describe("where elements start (EL18)", () => {
  it("gives a project the four question groups and places an element by its question", async () => {
    const grouping = await board();
    expect(grouping.groups.map((group) => [group.prompt, group.name])).toEqual([
      ["recorded", null],
      ["patient_state", null],
      ["method", null],
      ["context", null],
    ]);
    expect(grouping.groups[0]?.elements.map((element) => element.id)).toEqual([systolic]);
    expect(grouping.groups[1]?.elements.map((element) => element.id)).toEqual([position]);
    // An element without a question, such as a CSV row, starts in "Not grouped yet".
    expect(grouping.ungrouped.map((element) => element.id)).toEqual([csv]);
    expect(personLeaks(grouping, m)).toEqual([]);
  });
});

describe("the facilitator's grouping (EL18)", () => {
  it("moves an element to a group and back to not grouped", async () => {
    const method = await groupIdOf("method");
    expect(
      await moveElement(db, m.facilitator, {
        projectId: m.projectId,
        elementId: csv,
        groupId: method,
      }),
    ).toEqual({ ok: true, value: null });
    expect((await board()).groups[2]?.elements.map((element) => element.name)).toEqual([
      "Observer",
    ]);
    await moveElement(db, m.facilitator, { projectId: m.projectId, elementId: csv, groupId: null });
    expect((await board()).ungrouped.map((element) => element.name)).toEqual(["Observer"]);
  });

  it("renames a group and adds one after the others", async () => {
    const recorded = await groupIdOf("recorded");
    expect(
      await renameElementGroup(db, m.facilitator, {
        projectId: m.projectId,
        groupId: recorded,
        name: "The pressure",
      }),
    ).toEqual({ ok: true, value: null });
    const added = await addElementGroup(db, m.facilitator, {
      projectId: m.projectId,
      name: "Device",
    });
    expect(added.ok).toBe(true);
    const groups = (await board()).groups;
    expect(groups.map((group) => group.name)).toEqual(["The pressure", null, null, null, "Device"]);
  });

  it("refuses a participant, an outsider, a missing element or group, and after discover", async () => {
    const recorded = await groupIdOf("recorded");
    const move = { projectId: m.projectId, elementId: csv, groupId: recorded };
    expect(await moveElement(db, m.participant, move)).toEqual({ ok: false, error: "forbidden" });
    expect(await moveElement(db, m.outsider, move)).toEqual({ ok: false, error: "not_found" });
    expect(await groupingBoard(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    const nowhere = "0190a6b1-0000-7000-8000-000000000000";
    expect(await moveElement(db, m.facilitator, { ...move, elementId: nowhere })).toEqual({
      ok: false,
      error: "element_not_found",
    });
    expect(await moveElement(db, m.facilitator, { ...move, groupId: nowhere })).toEqual({
      ok: false,
      error: "element_group_not_found",
    });
    expect(
      await renameElementGroup(db, m.facilitator, {
        projectId: m.projectId,
        groupId: nowhere,
        name: "Other",
      }),
    ).toEqual({ ok: false, error: "element_group_not_found" });
    expect(
      await addElementGroup(db, m.participant, { projectId: m.projectId, name: "Other" }),
    ).toEqual({ ok: false, error: "forbidden" });
    await setPhase(db, m.projectId, "decide");
    expect(await moveElement(db, m.facilitator, move)).toEqual({
      ok: false,
      error: "groups_after_discover",
    });
    expect(
      await renameElementGroup(db, m.facilitator, {
        projectId: m.projectId,
        groupId: recorded,
        name: "Other",
      }),
    ).toEqual({ ok: false, error: "groups_after_discover" });
    expect(
      await addElementGroup(db, m.facilitator, { projectId: m.projectId, name: "Other" }),
    ).toEqual({ ok: false, error: "groups_after_discover" });
    expect(await askGroupCheck(db, m.facilitator, m.projectId)).toEqual({
      ok: false,
      error: "groups_after_discover",
    });
  });
});

describe("asking for the check (EL24)", () => {
  it("is refused before the reveal, in scope and for a participant", async () => {
    expect(await askGroupCheck(db, m.facilitator, m.projectId)).toEqual({
      ok: false,
      error: "group_check_before_reveal",
    });
    expect(await askGroupCheck(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    await setPhase(db, m.projectId, "scope");
    expect(await askGroupCheck(db, m.facilitator, m.projectId)).toEqual({
      ok: false,
      error: "phase_closed",
    });
  });

  it("keeps the first date when asked again", async () => {
    await asked();
    const first = (await board()).checkAskedAt;
    expect(first).not.toBeNull();
    expect(await askGroupCheck(db, m.facilitator, m.projectId)).toEqual({ ok: true, value: null });
    expect((await board()).checkAskedAt).toBe(first);
  });
});

describe("the participants' check (EL24)", () => {
  it("refuses every remark and the page before the facilitator asks", async () => {
    const recorded = await groupIdOf("recorded");
    expect(await groupCheck(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "group_check_not_asked",
    });
    expect(
      await setElsewhere(db, m.participant, {
        projectId: m.projectId,
        elementId: systolic,
        elsewhere: true,
      }),
    ).toEqual({ ok: false, error: "group_check_not_asked" });
    expect(
      await addGroupMissing(db, m.participant, {
        projectId: m.projectId,
        groupId: recorded,
        body: "Mean pressure",
      }),
    ).toEqual({ ok: false, error: "group_check_not_asked" });
    expect(await finishGroupCheck(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "group_check_not_asked",
    });
  });

  it("refuses a missing element or group, an outsider, and a participant outside discover", async () => {
    await asked();
    const nowhere = "0190a6b1-0000-7000-8000-000000000000";
    expect(
      await setElsewhere(db, m.participant, {
        projectId: m.projectId,
        elementId: nowhere,
        elsewhere: true,
      }),
    ).toEqual({ ok: false, error: "element_not_found" });
    expect(
      await addGroupMissing(db, m.participant, {
        projectId: m.projectId,
        groupId: nowhere,
        body: "Mean pressure",
      }),
    ).toEqual({ ok: false, error: "element_group_not_found" });
    expect(await finishGroupCheck(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
    await setPhase(db, m.projectId, "decide");
    expect(await groupCheck(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "phase_closed",
    });
    expect(await finishGroupCheck(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "phase_closed",
    });
  });

  it("keeps each participant's remarks their own; the facilitator reads them without names", async () => {
    await asked();
    const recorded = await groupIdOf("recorded");
    await setElsewhere(db, m.participant, {
      projectId: m.projectId,
      elementId: position,
      elsewhere: true,
    });
    await setElsewhere(db, m.otherParticipant, {
      projectId: m.projectId,
      elementId: position,
      elsewhere: true,
    });
    await addGroupMissing(db, m.otherParticipant, {
      projectId: m.projectId,
      groupId: recorded,
      body: "Mean arterial pressure",
    });
    expect(await finishGroupCheck(db, m.participant, m.projectId)).toEqual({
      ok: true,
      value: null,
    });

    const mine = await groupCheck(db, m.participant, m.projectId);
    if (!mine.ok) throw new Error(mine.error);
    expect(mine.value.elsewhere).toEqual([position]);
    expect(mine.value.missing).toEqual({});
    expect(mine.value.done).toBe(true);
    expect(JSON.stringify(mine.value)).not.toContain("Mean arterial pressure");
    expect(personLeaks(mine.value, m)).toEqual([]);

    // Taking a mark back removes only one's own.
    await setElsewhere(db, m.participant, {
      projectId: m.projectId,
      elementId: position,
      elsewhere: false,
    });
    const facilitator = await board();
    expect(facilitator.remarks).toEqual({
      elsewhere: { [position]: 1 },
      missing: { [recorded]: ["Mean arterial pressure"] },
    });
    expect(facilitator).toMatchObject({ participants: 2, checked: 1 });
    expect(personLeaks(facilitator, m)).toEqual([]);
  });
});
