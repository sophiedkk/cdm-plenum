// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The private-first brainstorm on real PostgreSQL (EL13, EL14, ADR 0012): before the reveal a
// participant's responses carry no element of anyone else; the facilitator sees all and the count
// per participant; after the reveal everyone sees every element without an author (EL2).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { getProject } from "../projects/queries.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { brainstormStatus, revealBoard, setPrivateBrainstorm } from "./brainstorm.ts";
import { importCsv } from "./import.ts";
import {
  addElement,
  addElementComment,
  listElementComments,
  listElements,
  listElementsWithAuthors,
  listOwnElements,
  mergeElements,
} from "./queries.ts";
import { addElementInput, csvImportInput } from "./schemas.ts";

let db: Kysely<DB>;
let m: ProjectMembers;

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db);
});

afterEach(async () => {
  await db.destroy();
});

async function add(userId: string, name: string, prompt: string | null = null): Promise<string> {
  const input = addElementInput.parse({ projectId: m.projectId, name, prompt });
  const added = await addElement(db, userId, input);
  if (!added.ok) throw new Error(added.error);
  return added.value.elementId;
}

async function names(userId: string): Promise<string[]> {
  const list = await listElements(db, userId, m.projectId);
  if (!list.ok) throw new Error(list.error);
  return list.value.map((element) => element.name);
}

/** Participant A (`m.participant`) adds an element with a comment; returns its id. */
async function elementOfA(): Promise<string> {
  const id = await add(m.participant, "Systolic of A", "recorded");
  const commented = await addElementComment(db, m.participant, {
    projectId: m.projectId,
    elementId: id,
    body: "Comment of A",
  });
  if (!commented.ok) throw new Error(commented.error);
  return id;
}

async function reveal(): Promise<void> {
  const revealed = await revealBoard(db, m.facilitator, m.projectId);
  if (!revealed.ok) throw new Error(revealed.error);
}

describe("a new project (EL13)", () => {
  it("starts in the private step, by owner decision", async () => {
    const project = await getProject(db, m.participant, m.projectId);
    expect(project.ok && project.value).toMatchObject({
      privateBrainstorm: true,
      boardRevealed: false,
    });
  });
});

describe("before the reveal (EL13)", () => {
  it("gives participant B none of participant A's elements or comments in any response", async () => {
    const theirs = await elementOfA();
    await add(m.facilitator, "Facilitator's element");
    const imported = await importCsv(
      db,
      m.facilitator,
      csvImportInput.parse({
        projectId: m.projectId,
        fileName: "form.csv",
        content: "name,description\nImported,From a form\n",
      }),
    );
    expect(imported.ok).toBe(true);
    const mine = await add(m.otherParticipant, "Diastolic of B");

    const responses = [
      await listElements(db, m.otherParticipant, m.projectId),
      await listOwnElements(db, m.otherParticipant, m.projectId),
      await listElementComments(db, m.otherParticipant, {
        projectId: m.projectId,
        elementId: theirs,
      }),
      await addElementComment(db, m.otherParticipant, {
        projectId: m.projectId,
        elementId: theirs,
        body: "Can I see it?",
      }),
      await listElementComments(db, m.otherParticipant, {
        projectId: m.projectId,
        elementId: mine,
      }),
    ];
    const json = JSON.stringify(responses);
    for (const hidden of [theirs, "Systolic of A", "Comment of A", "Facilitator's", "Imported"]) {
      expect(json).not.toContain(hidden);
    }
    expect(responses[0]).toMatchObject({ ok: true, value: [{ id: mine, name: "Diastolic of B" }] });
    expect(responses[2]).toEqual({ ok: false, error: "element_not_found" });
    expect(responses[3]).toEqual({ ok: false, error: "element_not_found" });
    for (const response of responses) expect(personLeaks(response, m)).toEqual([]);
  });

  it("lets a participant read and comment on their own element", async () => {
    const id = await elementOfA();
    expect(await names(m.participant)).toEqual(["Systolic of A"]);
    const comments = await listElementComments(db, m.participant, {
      projectId: m.projectId,
      elementId: id,
    });
    expect(comments.ok && comments.value.map((comment) => comment.body)).toEqual(["Comment of A"]);
  });

  it("shows the facilitator every element, with authors", async () => {
    await elementOfA();
    await add(m.otherParticipant, "Diastolic of B");
    expect(await names(m.facilitator)).toEqual(["Systolic of A", "Diastolic of B"]);
    const authored = await listElementsWithAuthors(db, m.facilitator, m.projectId);
    expect(authored.ok && authored.value.map((element) => element.author?.email)).toEqual([
      "par@example.test",
      "par2@example.test",
    ]);
  });

  it("shows every element when the facilitator switched the private step off", async () => {
    await elementOfA();
    const off = await setPrivateBrainstorm(db, m.facilitator, {
      projectId: m.projectId,
      enabled: false,
    });
    expect(off).toEqual({ ok: true, value: null });
    expect(await names(m.otherParticipant)).toEqual(["Systolic of A"]);
  });
});

describe("after the reveal (EL13, EL2)", () => {
  it("gives participant B participant A's elements and comments without an author", async () => {
    const theirs = await elementOfA();
    await reveal();
    const responses = [
      await listElements(db, m.otherParticipant, m.projectId),
      await listElementComments(db, m.otherParticipant, {
        projectId: m.projectId,
        elementId: theirs,
      }),
      await addElementComment(db, m.otherParticipant, {
        projectId: m.projectId,
        elementId: theirs,
        body: "Same as ours",
      }),
    ];
    expect(responses[0]).toMatchObject({
      ok: true,
      value: [{ id: theirs, name: "Systolic of A" }],
    });
    expect(responses[1]).toMatchObject({ ok: true, value: [{ body: "Comment of A" }] });
    expect(responses[2].ok).toBe(true);
    for (const response of responses) expect(personLeaks(response, m)).toEqual([]);
  });

  it("keeps a participant's own list to their own elements", async () => {
    await elementOfA();
    const mine = await add(m.otherParticipant, "Diastolic of B", "method");
    await reveal();
    const own = await listOwnElements(db, m.otherParticipant, m.projectId);
    expect(own.ok && own.value.map((element) => [element.id, element.prompt])).toEqual([
      [mine, "method"],
    ]);
  });
});

describe("brainstormStatus (EL13)", () => {
  it("counts the elements per participant, merged-away and facilitator elements left out", async () => {
    const first = await elementOfA();
    await add(m.participant, "Second of A");
    const duplicate = await add(m.participant, "Duplicate of A");
    await add(m.facilitator, "Facilitator's element");
    const merged = await mergeElements(db, m.facilitator, {
      projectId: m.projectId,
      intoId: first,
      fromIds: [duplicate],
    });
    expect(merged.ok).toBe(true);
    const status = await brainstormStatus(db, m.facilitator, m.projectId);
    expect(status.ok && status.value.privateBrainstorm).toBe(true);
    expect(status.ok && status.value.revealedAt).toBeNull();
    const counts = status.ok
      ? status.value.participants.map((participant) => [participant.email, participant.elements])
      : [];
    expect(counts.sort()).toEqual([
      ["par2@example.test", 0],
      ["par@example.test", 2],
    ]);
  });

  it("refuses a participant with forbidden and an outsider with not_found", async () => {
    expect(await brainstormStatus(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await brainstormStatus(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("revealBoard (EL13)", () => {
  it("reveals once and logs it with ids only", async () => {
    await reveal();
    const status = await brainstormStatus(db, m.facilitator, m.projectId);
    expect(status.ok && status.value.revealedAt).toEqual(expect.any(String));
    const project = await getProject(db, m.participant, m.projectId);
    expect(project.ok && project.value.boardRevealed).toBe(true);
    const logged = await db
      .selectFrom("activity_log")
      .select(["action", "target_type", "target_id", "actor_user_id"])
      .where("action", "=", "board_revealed")
      .execute();
    expect(logged).toEqual([
      {
        action: "board_revealed",
        target_type: "project",
        target_id: m.projectId,
        actor_user_id: m.facilitator,
      },
    ]);
  });

  it("refuses a second reveal with board_already_revealed", async () => {
    await reveal();
    expect(await revealBoard(db, m.facilitator, m.projectId)).toEqual({
      ok: false,
      error: "board_already_revealed",
    });
  });

  it("refuses a participant with forbidden and an outsider with not_found", async () => {
    expect(await revealBoard(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await revealBoard(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await names(m.otherParticipant)).toEqual([]);
    const project = await getProject(db, m.facilitator, m.projectId);
    expect(project.ok && project.value.boardRevealed).toBe(false);
  });
});

describe("setPrivateBrainstorm (EL13)", () => {
  it("switches the setting off and on before the reveal, and logs each change", async () => {
    const input = (enabled: boolean) => ({ projectId: m.projectId, enabled });
    expect(await setPrivateBrainstorm(db, m.facilitator, input(false))).toEqual({
      ok: true,
      value: null,
    });
    let project = await getProject(db, m.facilitator, m.projectId);
    expect(project.ok && project.value.privateBrainstorm).toBe(false);
    await setPrivateBrainstorm(db, m.facilitator, input(true));
    project = await getProject(db, m.facilitator, m.projectId);
    expect(project.ok && project.value.privateBrainstorm).toBe(true);
    const actions = await db
      .selectFrom("activity_log")
      .select("action")
      .where("action", "like", "private_brainstorm_%")
      .orderBy("id")
      .execute();
    expect(actions.map((row) => row.action)).toEqual([
      "private_brainstorm_off",
      "private_brainstorm_on",
    ]);
  });

  it("refuses a change after the reveal with board_already_revealed", async () => {
    await reveal();
    expect(
      await setPrivateBrainstorm(db, m.facilitator, { projectId: m.projectId, enabled: false }),
    ).toEqual({ ok: false, error: "board_already_revealed" });
  });

  it("refuses a participant with forbidden and an outsider with not_found", async () => {
    const input = { projectId: m.projectId, enabled: false };
    expect(await setPrivateBrainstorm(db, m.participant, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await setPrivateBrainstorm(db, m.outsider, input)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("the question an element answers (EL14)", () => {
  it("is stored with the element and validated before the query runs", async () => {
    await add(m.participant, "Cuff size", "method");
    const own = await listOwnElements(db, m.participant, m.projectId);
    expect(own.ok && own.value[0]?.prompt).toBe("method");
    const parse = (prompt: unknown) =>
      addElementInput.safeParse({ projectId: m.projectId, name: "A", prompt }).success;
    expect(parse("patient_state")).toBe(true);
    expect(parse(null)).toBe(true);
    expect(parse("protocol")).toBe(false);
  });

  it("is refused by the database for an unknown key", async () => {
    await expect(
      db
        .insertInto("element")
        .values({ project_id: m.projectId, name: "A", prompt: "protocol" })
        .execute(),
    ).rejects.toThrow(/element_prompt_check/);
  });

  it("gives an outsider not_found for the own list", async () => {
    expect(await listOwnElements(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
