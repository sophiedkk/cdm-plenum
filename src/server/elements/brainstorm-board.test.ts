// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The brainstorm board on real PostgreSQL (EL13, EL23, ADR 0020): the columns, the counts before
// the reveal, every refusal, and the anonymity boundary (EL2, Q-ANON-1): before the reveal a
// participant receives no word of another participant's elements, after it no author.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { insertImportedElement, setPhase } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { revealBoard } from "./brainstorm.ts";
import { brainstormBoard } from "./brainstorm-board.ts";
import { addElement, addElementComment, listElementComments, listElements } from "./queries.ts";
import { addElementInput } from "./schemas.ts";

let db: Kysely<DB>;
let m: ProjectMembers;

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "discover");
  const systolic = await insertImportedElement(db, m.projectId, "Systolic");
  await db.updateTable("element").set({ prompt: "recorded" }).where("id", "=", systolic).execute();
  await add(m.participant, "Measured at home", "context");
  await add(m.otherParticipant, "Time since medicine", "patient_state");
  await add(m.otherParticipant, "Arm used", "method");
});

afterEach(async () => {
  await db.destroy();
});

async function add(
  userId: string,
  name: string,
  prompt: "recorded" | "patient_state" | "method" | "context",
) {
  const added = await addElement(
    db,
    userId,
    addElementInput.parse({ projectId: m.projectId, name, prompt }),
  );
  if (!added.ok) throw new Error(added.error);
}

async function boardOf(userId: string) {
  const result = await brainstormBoard(db, userId, m.projectId);
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

const names = (cards: { name: string }[]) => cards.map((card) => card.name);

describe("the brainstorm board (EL23)", () => {
  it("shows a participant their own cards, the existing models' and only counts of others", async () => {
    const board = await boardOf(m.participant);
    expect(board.privateStep).toBe(true);
    expect(board.columns.map((column) => column.prompt)).toEqual([
      "recorded",
      "patient_state",
      "method",
      "context",
    ]);
    const [recorded, state, method, context] = board.columns;
    expect(names(recorded?.fromModels ?? [])).toEqual(["Systolic"]);
    expect(names(context?.own ?? [])).toEqual(["Measured at home"]);
    expect(state?.hidden).toBe(1);
    expect(method?.hidden).toBe(1);
    expect(board.columns.flatMap((column) => column.others)).toEqual([]);
    expect(board).toMatchObject({ participants: 2, contributors: 2, added: 3, own: 1 });
    const json = JSON.stringify(board);
    expect(json).not.toContain("Time since medicine");
    expect(json).not.toContain("Arm used");
    expect(personLeaks(board, m)).toEqual([]);
  });

  it("shows every card after the reveal, without authors", async () => {
    const revealed = await revealBoard(db, m.facilitator, m.projectId);
    expect(revealed.ok).toBe(true);
    const board = await boardOf(m.participant);
    expect(board.privateStep).toBe(false);
    expect(names(board.columns[1]?.others ?? [])).toEqual(["Time since medicine"]);
    expect(board.columns.every((column) => column.hidden === 0)).toBe(true);
    expect(personLeaks(board, m)).toEqual([]);
  });

  it("shows the facilitator every card before the reveal, without authors", async () => {
    const board = await boardOf(m.facilitator);
    expect(board.privateStep).toBe(false);
    expect(names(board.columns.flatMap((column) => column.others))).toEqual([
      "Time since medicine",
      "Arm used",
      "Measured at home",
    ]);
    expect(personLeaks(board, m)).toEqual([]);
  });

  it("refuses an outsider and closes outside discover for a participant", async () => {
    expect(await brainstormBoard(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
    await setPhase(db, m.projectId, "decide");
    expect(await brainstormBoard(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "phase_closed",
    });
  });

  it("shows a participant only their own comments under an element from a model, before the reveal", async () => {
    const [systolic] = await db
      .selectFrom("element")
      .select("id")
      .where("project_id", "=", m.projectId)
      .where("name", "=", "Systolic")
      .execute();
    const elementId = systolic?.id ?? "";
    for (const [userId, body] of [
      [m.participant, "Mine"],
      [m.otherParticipant, "Theirs"],
    ] as const) {
      const added = await addElementComment(db, userId, {
        projectId: m.projectId,
        elementId,
        body,
      });
      expect(added.ok).toBe(true);
    }
    const comments = await listElementComments(db, m.participant, {
      projectId: m.projectId,
      elementId,
    });
    if (!comments.ok) throw new Error(comments.error);
    expect(comments.value.map((comment) => comment.body)).toEqual(["Mine"]);
    const list = await listElements(db, m.participant, m.projectId);
    if (!list.ok) throw new Error(list.error);
    expect(list.value.find((element) => element.id === elementId)?.commentCount).toBe(1);
  });

  it("lets a participant read the elements from existing models on the board in the private step", async () => {
    const list = await listElements(db, m.participant, m.projectId);
    if (!list.ok) throw new Error(list.error);
    expect(list.value.map((element) => element.name).sort()).toEqual([
      "Measured at home",
      "Systolic",
    ]);
  });
});
