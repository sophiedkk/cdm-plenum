// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Who is named in a Team project beyond the board and comments (PR14, ADR 0023): the author of a
// detail objection and who suggested a source model. A Delphi project names nobody. A Team
// project names a person by name only: never an address, and a person without a name comes back
// with an empty name for the screen to label (sign-in security review 2026-11-25).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectMode } from "@/lib/project-mode";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { answerDetail, detailBoard, proposeDetail } from "../details/queries.ts";
import { listElements } from "../elements/queries.ts";
import { listScopeComments } from "../scope/queries.ts";
import { listSourceModels, suggestSource } from "../sources/queries.ts";
import { otherSourceInput } from "../sources/schemas.ts";
import {
  closedRoundWithOutcomes,
  insertElement,
  joinedParticipant,
  setPhase,
} from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";

let db: Kysely<DB>;
let m: ProjectMembers;

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "detail");
  await db
    .updateTable("user")
    .set({ name: "Invented Nurse" })
    .where("id", "=", m.participant)
    .execute();
});

afterEach(async () => {
  await db.destroy();
});

async function setMode(mode: ProjectMode) {
  await db.updateTable("project").set({ mode }).where("id", "=", m.projectId).execute();
}

/** An objection by `m.participant` to a structure proposal, read by an architect. */
async function objectionRead() {
  const architect = await joinedParticipant(db, m.facilitator, m.projectId, "Architecture", "arch");
  const systolic = await insertElement(db, m.projectId, "Systolic");
  await closedRoundWithOutcomes(db, m.projectId, [[systolic, "included"]]);
  const proposed = await proposeDetail(db, m.facilitator, {
    projectId: m.projectId,
    elementId: systolic,
    version: 0,
    dataType: "quantity",
    cardinality: { min: 1, max: 1 },
    units: [],
    values: [],
  });
  if (!proposed.ok) throw new Error(proposed.error);
  const answered = await answerDetail(db, m.participant, {
    projectId: m.projectId,
    proposalId: proposed.value.proposalId,
    version: proposed.value.version,
    answer: "objection",
    reason: "The unit is missing.",
  });
  if (!answered.ok) throw new Error(answered.error);
  const board = await detailBoard(db, architect, m.projectId);
  if (!board.ok) throw new Error(board.error);
  return board;
}

describe.each([
  ["team", true],
  ["delphi", false],
] as const)("%s project: detail objections", (mode, named) => {
  it("names the author of an objection only in a Team", async () => {
    await setMode(mode);
    const board = await objectionRead();
    const objections = board.value.elements.flatMap(
      (element) => element.proposal?.answers?.objections ?? [],
    );
    expect(objections).toHaveLength(1);
    expect(objections[0]?.reason).toBe("The unit is missing.");
    if (named) {
      expect(objections[0]?.author).toEqual({ name: "Invented Nurse" });
      expect(JSON.stringify(board)).not.toContain("@example.test");
      expect(JSON.stringify(board)).not.toContain(m.participant);
    } else {
      expect(personLeaks(board, m).filter((leak) => leak !== "key:member")).toEqual([]);
      expect(JSON.stringify(board)).not.toContain("Invented Nurse");
      expect(objections[0]).not.toHaveProperty("author");
    }
  });
});

describe.each([
  ["team", true],
  ["delphi", false],
] as const)("%s project: source models", (mode, named) => {
  it("names who suggested a source model only in a Team", async () => {
    await setMode(mode);
    await setPhase(db, m.projectId, "discover");
    const suggested = await suggestSource(
      db,
      m.participant,
      otherSourceInput.parse({
        projectId: m.projectId,
        title: "Ward observation form",
        link: "https://forms.example.test/bp",
      }),
    );
    if (!suggested.ok) throw new Error(suggested.error);
    const listed = await listSourceModels(db, m.otherParticipant, { projectId: m.projectId });
    if (!listed.ok) throw new Error(listed.error);
    if (named) {
      expect(listed.value.map((model) => model.addedBy)).toEqual([{ name: "Invented Nurse" }]);
      expect(JSON.stringify(listed)).not.toContain("@example.test");
    } else {
      expect(personLeaks(listed, m)).toEqual([]);
      expect(JSON.stringify(listed)).not.toContain("Invented Nurse");
    }
  });
});

describe("a Team project never sends an address to a participant", () => {
  it("returns an empty name for a person without one, in every participant read path", async () => {
    await setMode("team");
    // Nobody has a name: `insertUser` creates users with an empty one.
    await db.updateTable("user").set({ name: "" }).where("id", "=", m.participant).execute();
    await setPhase(db, m.projectId, "discover");
    const suggested = await suggestSource(
      db,
      m.participant,
      otherSourceInput.parse({
        projectId: m.projectId,
        title: "Form",
        link: "https://forms.example.test/x",
      }),
    );
    if (!suggested.ok) throw new Error(suggested.error);
    const sources = await listSourceModels(db, m.otherParticipant, { projectId: m.projectId });
    const responses = [
      sources,
      await listElements(db, m.otherParticipant, m.projectId),
      await listScopeComments(db, m.otherParticipant, m.projectId),
    ];
    for (const response of responses) {
      expect(JSON.stringify(response)).not.toContain("@example.test");
      expect(JSON.stringify(response)).not.toContain(m.participant);
    }
    expect(sources?.ok && sources.value.map((model) => model.addedBy)).toEqual([{ name: "" }]);
  });
});
