// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The recap of a done phase on real PostgreSQL (PR13, ADR 0020): only done phases have one,
// every member reads it, and no fact names a person (Q-ANON-1).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { revealBoard } from "../elements/brainstorm.ts";
import { addElement, mergeElements } from "../elements/queries.ts";
import { addElementInput } from "../elements/schemas.ts";
import { addScopeSource, updateScope } from "../scope/queries.ts";
import { insertImportedElement, setPhase } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { phaseRecap } from "./recap.ts";

let db: Kysely<DB>;
let m: ProjectMembers;

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "discover");
});

afterEach(async () => {
  await db.destroy();
});

async function add(userId: string, name: string): Promise<string> {
  const added = await addElement(
    db,
    userId,
    addElementInput.parse({ projectId: m.projectId, name, prompt: "recorded" }),
  );
  if (!added.ok) throw new Error(added.error);
  return added.value.elementId;
}

describe("phaseRecap (PR13)", () => {
  it("has no recap for the current phase or a later one", async () => {
    for (const phase of ["discover", "decide", "handoff"] as const) {
      expect(await phaseRecap(db, m.participant, m.projectId, phase)).toEqual({
        ok: false,
        error: "recap_not_ready",
      });
    }
    expect(await phaseRecap(db, m.outsider, m.projectId, "scope")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("recaps the scope with its statement and sources for a participant", async () => {
    await setPhase(db, m.projectId, "scope");
    const scoped = await updateScope(db, m.facilitator, {
      projectId: m.projectId,
      concept: "The blood pressure of an adult.",
      useCases: "Outpatient visit.",
      outOfScope: "Invasive pressure.",
    });
    expect(scoped.ok).toBe(true);
    await addScopeSource(db, m.facilitator, {
      projectId: m.projectId,
      label: "Invented form",
      url: null,
    });
    await setPhase(db, m.projectId, "discover");
    const recap = await phaseRecap(db, m.participant, m.projectId, "scope");
    expect(recap).toMatchObject({
      ok: true,
      value: {
        phase: "scope",
        concept: "The blood pressure of an adult.",
        sources: [{ label: "Invented form", url: null }],
      },
    });
  });

  it("recaps discover: the elements by origin, the merged duplicates and the groups", async () => {
    await insertImportedElement(db, m.projectId, "Systolic");
    const a = await add(m.participant, "Heart rate");
    const b = await add(m.otherParticipant, "Pulse rate");
    await add(m.otherParticipant, "Rhythm");
    expect((await revealBoard(db, m.facilitator, m.projectId)).ok).toBe(true);
    const merged = await mergeElements(db, m.facilitator, {
      projectId: m.projectId,
      intoId: a,
      fromIds: [b],
    });
    expect(merged.ok).toBe(true);
    await setPhase(db, m.projectId, "decide");
    const recap = await phaseRecap(db, m.participant, m.projectId, "discover");
    if (!recap.ok || recap.value.phase !== "discover") throw new Error("no discover recap");
    expect(recap.value).toMatchObject({
      elements: 3,
      fromModels: 1,
      added: 2,
      contributors: 2,
      fromFiles: 0,
      merged: 1,
      firstRound: null,
    });
    expect(recap.value.groups.map((group) => [group.prompt, group.elements.length])).toEqual([
      ["recorded", 2],
    ]);
    expect(personLeaks(recap.value, m)).toEqual([]);
  });

  it("names no other participant's element when the board was never revealed (EL13)", async () => {
    await insertImportedElement(db, m.projectId, "Systolic");
    await add(m.participant, "Heart rate");
    await add(m.otherParticipant, "Secret pulse");
    await setPhase(db, m.projectId, "decide");
    const recap = await phaseRecap(db, m.participant, m.projectId, "discover");
    if (!recap.ok || recap.value.phase !== "discover") throw new Error("no discover recap");
    const names = recap.value.groups.flatMap((group) => group.elements.map((e) => e.name));
    expect(names).toEqual(["Heart rate"]);
    expect(JSON.stringify(recap.value)).not.toContain("Secret pulse");
    expect(recap.value).toMatchObject({ elements: 3, added: 2 });
    // The facilitator sees every element.
    const facilitator = await phaseRecap(db, m.facilitator, m.projectId, "discover");
    expect(JSON.stringify(facilitator)).toContain("Secret pulse");
  });

  it("has no recap of hand-off, the last phase, while in hand-off", async () => {
    await setPhase(db, m.projectId, "handoff");
    expect(await phaseRecap(db, m.facilitator, m.projectId, "handoff")).toEqual({
      ok: false,
      error: "recap_not_ready",
    });
  });

  it("recaps decide in hand-off with its rounds", async () => {
    await setPhase(db, m.projectId, "handoff");
    const recap = await phaseRecap(db, m.facilitator, m.projectId, "decide");
    expect(recap).toMatchObject({ ok: true, value: { phase: "decide", rounds: [] } });
  });
});
