// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Whether participants see who is in each stakeholder group (PR7, owner decision 2026-11-19) on
// real PostgreSQL: off by default, names only when on, never an address, and never an author or
// a rater (Q-ANON-1, ADR 0005).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import {
  addElement,
  addElementComment,
  listElementComments,
  listElements,
} from "../elements/queries.ts";
import { addElementInput } from "../elements/schemas.ts";
import { addScopeComment, listScopeComments } from "../scope/queries.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { getProject, listGroups, setGroupNamesVisible, setRaterGroup } from "./queries.ts";

let db: Kysely<DB>;
let m: ProjectMembers;

const NAMES = {
  facilitator: "Invented Facilitator",
  participant: "Invented Nurse",
  otherParticipant: "",
} as const;

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db);
  for (const [role, name] of Object.entries(NAMES)) {
    await db
      .updateTable("user")
      .set({ name })
      .where("id", "=", m[role as keyof typeof NAMES])
      .execute();
  }
});

afterEach(async () => {
  await db.destroy();
});

async function groups(userId: string) {
  const listed = await listGroups(db, userId, m.projectId);
  if (!listed.ok) throw new Error(listed.error);
  return listed.value;
}

async function visible(value: boolean) {
  return setGroupNamesVisible(db, m.facilitator, { projectId: m.projectId, visible: value });
}

describe("group names setting (PR7)", () => {
  it("is off for a new project: every member gets counts and no names", async () => {
    const detail = await getProject(db, m.participant, m.projectId);
    expect(detail.ok && detail.value.groupNamesVisible).toBe(false);
    for (const user of [m.participant, m.facilitator]) {
      const listed = await groups(user);
      expect(listed.every((group) => group.names === null)).toBe(true);
      expect(listed.find((group) => group.name === "Nursing")?.participants).toBe(2);
      expect(JSON.stringify(listed)).not.toContain(NAMES.participant);
      expect(personLeaks(listed, m)).toEqual([]);
    }
  });

  it("when on, shows participants the names per group and never an address", async () => {
    expect(await visible(true)).toEqual({ ok: true, value: null });
    const detail = await getProject(db, m.participant, m.projectId);
    expect(detail.ok && detail.value.groupNamesVisible).toBe(true);
    const listed = await groups(m.participant);
    // A person without a name comes as an empty string, so the count and the list agree.
    expect(listed.find((group) => group.name === "Nursing")?.names).toEqual([
      "",
      NAMES.participant,
    ]);
    expect(listed.find((group) => group.name === "Patient")?.names).toEqual([]);
    expect(personLeaks(listed, m)).toEqual([]);
  });

  it("names a facilitator who joined a group to rate, and only when on (DE14)", async () => {
    const terminology = (await groups(m.facilitator)).find((g) => g.name === "Terminology");
    await setRaterGroup(db, m.facilitator, {
      projectId: m.projectId,
      groupId: terminology?.id ?? null,
    });
    let listed = await groups(m.participant);
    expect(listed.find((group) => group.name === "Terminology")).toMatchObject({
      participants: 1,
      names: null,
    });
    await visible(true);
    listed = await groups(m.participant);
    expect(listed.find((group) => group.name === "Terminology")?.names).toEqual([
      NAMES.facilitator,
    ]);
  });

  it("turns off again and logs each change with ids only", async () => {
    await visible(true);
    await visible(false);
    expect((await groups(m.participant)).every((group) => group.names === null)).toBe(true);
    const rows = await db
      .selectFrom("activity_log")
      .select(["action", "target_type", "target_id"])
      .where("action", "like", "group_names_%")
      .orderBy("id")
      .execute();
    expect(rows).toEqual([
      { action: "group_names_shown", target_type: "project", target_id: m.projectId },
      { action: "group_names_hidden", target_type: "project", target_id: m.projectId },
    ]);
  });

  it("refuses a participant (forbidden) and a non-member (not_found)", async () => {
    const input = { projectId: m.projectId, visible: true };
    expect(await setGroupNamesVisible(db, m.participant, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await setGroupNamesVisible(db, m.outsider, input)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await listGroups(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
    const detail = await getProject(db, m.facilitator, m.projectId);
    expect(detail.ok && detail.value.groupNamesVisible).toBe(false);
  });

  it("when on, still names no author of an element or comment (Q-ANON-1)", async () => {
    await visible(true);
    const projectId = m.projectId;
    const added = await addElement(
      db,
      m.otherParticipant,
      addElementInput.parse({ projectId, name: "Cuff size" }),
    );
    if (!added.ok) throw new Error(added.error);
    const elementId = added.value.elementId;
    await addElementComment(db, m.otherParticipant, { projectId, elementId, body: "A comment" });
    await addScopeComment(db, m.otherParticipant, { projectId, body: "A scope comment" });
    const responses = [
      await listElements(db, m.participant, projectId),
      await listElementComments(db, m.participant, { projectId, elementId }),
      await listScopeComments(db, m.participant, projectId),
    ];
    for (const response of responses) {
      expect(response.ok).toBe(true);
      expect(personLeaks(response, m)).toEqual([]);
      expect(JSON.stringify(response)).not.toContain("Invented");
    }
  });
});
