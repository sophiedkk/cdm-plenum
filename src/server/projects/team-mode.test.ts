// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project mode on real PostgreSQL (PR14, ADR 0023): the choice at creation, the change until
// the first round opens (`mode_locked`), and who is named. A Team project names the author of an
// element, a comment and a brainstorm card to the other participants; a Delphi project keeps
// naming nobody (Q-ANON-1, ADR 0005).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectMode } from "@/lib/project-mode";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { revealBoard } from "../elements/brainstorm.ts";
import { brainstormBoard } from "../elements/brainstorm-board.ts";
import {
  addElement,
  addElementComment,
  listElementComments,
  listElements,
  listElementsWithAuthors,
} from "../elements/queries.ts";
import { addElementInput } from "../elements/schemas.ts";
import { addScopeComment, listScopeComments } from "../scope/queries.ts";
import { facilitatorWithProject, setPhase } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { createProject, getProject, setProjectMode } from "./queries.ts";

let db: Kysely<DB>;
let m: ProjectMembers;

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db);
  await db
    .updateTable("user")
    .set({ name: "Invented Nurse" })
    .where("id", "=", m.participant)
    .execute();
  await db
    .updateTable("user")
    .set({ name: "Invented Doctor" })
    .where("id", "=", m.otherParticipant)
    .execute();
});

afterEach(async () => {
  await db.destroy();
});

async function setMode(mode: ProjectMode) {
  await db.updateTable("project").set({ mode }).where("id", "=", m.projectId).execute();
}

/** A round that has opened, with the panel snapshot the database requires (DE11). */
async function openRound(closed = false) {
  await db
    .insertInto("round")
    .values({
      project_id: m.projectId,
      number: 1,
      closes_at: new Date(),
      opened_at: new Date(),
      closed_at: closed ? new Date() : null,
      panel_clinical: 2,
      minimum_clinical: 2,
      panel_terminology: 0,
      minimum_terminology: 0,
      panel_architecture: 1,
      minimum_architecture: 1,
    })
    .execute();
}

async function modeOf(userId: string) {
  const detail = await getProject(db, userId, m.projectId);
  if (!detail.ok) throw new Error(detail.error);
  return detail.value;
}

describe("the choice at creation (PR14)", () => {
  it("makes a Delphi study unless the facilitator picks a Team", async () => {
    const { userId } = await facilitatorWithProject(db);
    const delphi = await createProject(db, userId, { name: "One" }, "en");
    const team = await createProject(db, userId, { name: "Two", mode: "team" }, "en");
    if (!delphi.ok || !team.ok) throw new Error("create refused");
    const rows = await db.selectFrom("project").select(["id", "mode"]).execute();
    expect(rows.find((row) => row.id === delphi.value.projectId)?.mode).toBe("delphi");
    expect(rows.find((row) => row.id === team.value.projectId)?.mode).toBe("team");
  });
});

describe("changing the mode until the first round opens (PR14)", () => {
  const input = (mode: ProjectMode) => ({ projectId: m.projectId, mode });

  it("lets the facilitator switch and switch back, and logs it with ids only", async () => {
    expect((await modeOf(m.facilitator)).mode).toBe("delphi");
    expect(await setProjectMode(db, m.facilitator, input("team"))).toEqual({
      ok: true,
      value: null,
    });
    const after = await modeOf(m.participant);
    expect(after).toMatchObject({ mode: "team", modeLocked: false });
    expect(await setProjectMode(db, m.facilitator, input("delphi"))).toEqual({
      ok: true,
      value: null,
    });
    expect((await modeOf(m.facilitator)).mode).toBe("delphi");
    const rows = await db
      .selectFrom("activity_log")
      .select(["action", "target_type", "target_id"])
      .where("action", "=", "project_mode_set")
      .execute();
    expect(rows).toEqual([
      { action: "project_mode_set", target_type: "project", target_id: m.projectId },
      { action: "project_mode_set", target_type: "project", target_id: m.projectId },
    ]);
  });

  it("refuses a change with mode_locked once a round has opened, for the facilitator", async () => {
    await openRound();
    expect(await setProjectMode(db, m.facilitator, input("team"))).toEqual({
      ok: false,
      error: "mode_locked",
    });
    const locked = await modeOf(m.facilitator);
    expect(locked).toMatchObject({ mode: "delphi", modeLocked: true });
  });

  it("keeps the mode locked after the round has closed", async () => {
    await openRound(true);
    expect(await setProjectMode(db, m.facilitator, input("team"))).toEqual({
      ok: false,
      error: "mode_locked",
    });
  });

  it("does not count a draft round that has not opened", async () => {
    await db
      .insertInto("round")
      .values({ project_id: m.projectId, number: 1, closes_at: new Date() })
      .execute();
    expect(await setProjectMode(db, m.facilitator, input("team"))).toEqual({
      ok: true,
      value: null,
    });
  });

  it("refuses a participant (forbidden) and an outsider (not_found), before and after a round", async () => {
    for (const round of [false, true]) {
      if (round) await openRound();
      expect(await setProjectMode(db, m.participant, input("team"))).toEqual({
        ok: false,
        error: "forbidden",
      });
      expect(await setProjectMode(db, m.outsider, input("team"))).toEqual({
        ok: false,
        error: "not_found",
      });
    }
    expect((await modeOf(m.facilitator)).mode).toBe("delphi");
  });
});

/** Who is named in each response a participant reads, in the given mode. */
describe.each([
  ["team", true],
  ["delphi", false],
] as const)("%s project: the names a participant reads", (mode, named) => {
  let elementId: string;

  beforeEach(async () => {
    await setMode(mode);
    const commented = await addScopeComment(db, m.otherParticipant, {
      projectId: m.projectId,
      body: "A scope comment",
    });
    if (!commented.ok) throw new Error(commented.error);
    await setPhase(db, m.projectId, "discover");
    const revealed = await revealBoard(db, m.facilitator, m.projectId);
    if (!revealed.ok) throw new Error(revealed.error);
    const added = await addElement(
      db,
      m.otherParticipant,
      addElementInput.parse({ projectId: m.projectId, name: "Cuff size", prompt: "method" }),
    );
    if (!added.ok) throw new Error(added.error);
    elementId = added.value.elementId;
    await addElementComment(db, m.otherParticipant, {
      projectId: m.projectId,
      elementId,
      body: "A comment",
    });
  });

  it("the board", async () => {
    const result = await listElements(db, m.participant, m.projectId);
    if (!result.ok) throw new Error(result.error);
    const element = result.value.find((item) => item.name === "Cuff size");
    if (named) {
      expect(element?.author).toEqual({ name: "Invented Doctor" });
      expect(JSON.stringify(result)).not.toContain("@example.test");
      expect(JSON.stringify(result)).not.toContain(m.otherParticipant);
    } else {
      expect(personLeaks(result, m)).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("Invented");
    }
  });

  it("the comments under an element", async () => {
    const result = await listElementComments(db, m.participant, {
      projectId: m.projectId,
      elementId,
    });
    if (!result.ok) throw new Error(result.error);
    if (named) {
      expect(result.value.map((comment) => comment.author)).toEqual([{ name: "Invented Doctor" }]);
      expect(JSON.stringify(result)).not.toContain("@example.test");
    } else {
      expect(personLeaks(result, m)).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("Invented");
    }
  });

  it("the comments on the scope", async () => {
    const result = await listScopeComments(db, m.participant, m.projectId);
    if (!result.ok) throw new Error(result.error);
    if (named) {
      expect(result.value.map((comment) => comment.author)).toEqual([{ name: "Invented Doctor" }]);
      expect(JSON.stringify(result)).not.toContain("@example.test");
    } else {
      expect(personLeaks(result, m)).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("Invented");
    }
  });

  it("the brainstorm cards after the reveal", async () => {
    const result = await brainstormBoard(db, m.participant, m.projectId);
    if (!result.ok) throw new Error(result.error);
    const others = result.value.columns.flatMap((column) => column.others);
    expect(others.map((card) => card.name)).toEqual(["Cuff size"]);
    if (named) {
      expect(others.map((card) => card.author)).toEqual([{ name: "Invented Doctor" }]);
      expect(JSON.stringify(result)).not.toContain("@example.test");
    } else {
      expect(personLeaks(result, m)).toEqual([]);
      expect(JSON.stringify(result)).not.toContain("Invented");
    }
  });

  it("sends no address for a person without a name", async () => {
    await db.updateTable("user").set({ name: "" }).where("id", "=", m.otherParticipant).execute();
    const responses = [
      await listElements(db, m.participant, m.projectId),
      await listElementComments(db, m.participant, { projectId: m.projectId, elementId }),
      await listScopeComments(db, m.participant, m.projectId),
      await brainstormBoard(db, m.participant, m.projectId),
    ];
    for (const response of responses) {
      expect(JSON.stringify(response)).not.toContain("@example.test");
      expect(JSON.stringify(response)).not.toContain(m.otherParticipant);
    }
    if (named) {
      const comments = responses[1];
      expect(
        comments?.ok && (comments.value as { author?: unknown }[]).map((c) => c.author),
      ).toEqual([{ name: "" }]);
    }
  });

  it("never names the participant to an outsider", async () => {
    for (const response of [
      await listElements(db, m.outsider, m.projectId),
      await listElementComments(db, m.outsider, { projectId: m.projectId, elementId }),
      await listScopeComments(db, m.outsider, m.projectId),
      await brainstormBoard(db, m.outsider, m.projectId),
    ]) {
      expect(response).toEqual({ ok: false, error: "not_found" });
    }
  });

  it("keeps the facilitator's list with authors as it is", async () => {
    const result = await listElementsWithAuthors(db, m.facilitator, m.projectId);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.find((item) => item.name === "Cuff size")?.author).toMatchObject({
      name: "Invented Doctor",
      email: expect.stringContaining("@example.test"),
    });
    expect(await listElementsWithAuthors(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });
});

describe("a Team project still hides other people's work before the reveal (EL13)", () => {
  it("shows a participant only their own elements, named, and no word of the others", async () => {
    await setMode("team");
    await setPhase(db, m.projectId, "discover");
    for (const [userId, name] of [
      [m.participant, "Own element"],
      [m.otherParticipant, "Other element"],
    ] as const) {
      const added = await addElement(
        db,
        userId,
        addElementInput.parse({ projectId: m.projectId, name }),
      );
      if (!added.ok) throw new Error(added.error);
    }
    const result = await listElements(db, m.participant, m.projectId);
    if (!result.ok) throw new Error(result.error);
    expect(result.value.map((element) => element.name)).toEqual(["Own element"]);
    expect(JSON.stringify(result)).not.toContain("Invented Doctor");
    const board = await brainstormBoard(db, m.participant, m.projectId);
    expect(JSON.stringify(board)).not.toContain("Other element");
    expect(JSON.stringify(board)).not.toContain("Invented Doctor");
  });
});
