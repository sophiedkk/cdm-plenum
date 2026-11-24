// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A reference element in the detail phase on real PostgreSQL (EL26, ADR 0021, DT1, DT4): its
// structure proposal carries a cardinality only and it gets no code proposal, per role, with
// the anonymity boundary of the detail board (EL2, Q-ANON-1).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DetailStructure } from "@/lib/details";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { closedRoundWithOutcomes, joinedParticipant, setPhase } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import {
  detailBoard,
  detailProgress,
  modelStructures,
  proposeDetail,
  settleDetail,
} from "./queries.ts";
import { proposeCodes } from "./terminology.ts";

let db: Kysely<DB>;
let m: ProjectMembers;
let architect: string;
let terminologist: string;
let reference: string;

const ZIB = { title: "Zib Bloeddruk", url: "https://models.example.test/zib/bloeddruk" };
const CARDINALITY_ONLY: DetailStructure = {
  dataType: null,
  cardinality: { min: 0, max: null },
  values: [],
};

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "detail");
  architect = await joinedParticipant(db, m.facilitator, m.projectId, "Architecture", "arch");
  terminologist = await joinedParticipant(db, m.facilitator, m.projectId, "Terminology", "term");
  const row = await db
    .insertInto("element")
    .values({
      project_id: m.projectId,
      name: "Blood pressure",
      kind: "reference",
      reference_title: ZIB.title,
      reference_url: ZIB.url,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  reference = row.id;
  await closedRoundWithOutcomes(db, m.projectId, [[reference, "included"]]);
});

afterEach(async () => {
  await db.destroy();
});

const propose = (userId: string, structure: DetailStructure, version = 0) =>
  proposeDetail(db, userId, {
    projectId: m.projectId,
    elementId: reference,
    version,
    ...structure,
  });

const proposeCode = (userId: string) =>
  proposeCodes(db, userId, {
    projectId: m.projectId,
    elementId: reference,
    version: 0,
    code: { system: "http://loinc.org", code: "85354-9", display: null },
    bindingStrength: null,
    valueSetUrl: null,
    valueCodes: [],
  });

describe("the structure of a reference (DT1, EL26)", () => {
  it("takes a cardinality only, from the facilitator and an architect, and settles it", async () => {
    const byFacilitator = await propose(m.facilitator, CARDINALITY_ONLY);
    expect(byFacilitator).toEqual({
      ok: true,
      value: { proposalId: expect.any(String), version: 1 },
    });
    const byArchitect = await propose(
      architect,
      { ...CARDINALITY_ONLY, cardinality: { min: 1, max: 1 } },
      1,
    );
    if (!byArchitect.ok) throw new Error(byArchitect.error);
    const settled = await settleDetail(db, m.facilitator, {
      projectId: m.projectId,
      ...byArchitect.value,
    });
    expect(settled).toEqual({ ok: true, value: null });
    const [structure] = await modelStructures(db, m.projectId);
    expect(structure).toMatchObject({
      reference: ZIB,
      settled: true,
      structure: { dataType: null, cardinality: { min: 1, max: 1 }, values: [] },
    });
  });

  it("refuses a data type or values with detail_reference_structure, per proposer", async () => {
    for (const userId of [m.facilitator, architect]) {
      expect(await propose(userId, { ...CARDINALITY_ONLY, dataType: "quantity" })).toEqual({
        ok: false,
        error: "detail_reference_structure",
      });
      expect(
        await propose(userId, {
          ...CARDINALITY_ONLY,
          values: [{ text: "High", value: null }],
        }),
      ).toEqual({ ok: false, error: "detail_reference_structure" });
    }
    const proposals = await db.selectFrom("detail_proposal").select("id").execute();
    expect(proposals).toEqual([]);
  });

  it("keeps the role and phase refusals ahead of the reference check", async () => {
    expect(await propose(m.participant, { ...CARDINALITY_ONLY, dataType: "quantity" })).toEqual({
      ok: false,
      error: "detail_not_architect",
    });
    await setPhase(db, m.projectId, "handoff");
    expect(await propose(m.facilitator, { ...CARDINALITY_ONLY, dataType: "quantity" })).toEqual({
      ok: false,
      error: "phase_closed",
    });
  });
});

describe("the codes of a reference (DT4, EL26)", () => {
  it("refuses a code proposal with detail_reference_codes, also after the structure settled", async () => {
    for (const userId of [m.facilitator, terminologist]) {
      expect(await proposeCode(userId)).toEqual({ ok: false, error: "detail_reference_codes" });
    }
    const proposal = await propose(m.facilitator, CARDINALITY_ONLY);
    if (!proposal.ok) throw new Error(proposal.error);
    await settleDetail(db, m.facilitator, { projectId: m.projectId, ...proposal.value });
    expect(await proposeCode(terminologist)).toEqual({
      ok: false,
      error: "detail_reference_codes",
    });
  });

  it("refuses a participant outside a terminology group first with detail_not_terminologist", async () => {
    expect(await proposeCode(m.participant)).toEqual({
      ok: false,
      error: "detail_not_terminologist",
    });
  });
});

describe("the detail board (DT1, EL26)", () => {
  it("names the model of a reference to every member, without naming a person", async () => {
    const proposal = await propose(architect, CARDINALITY_ONLY);
    expect(proposal.ok).toBe(true);
    for (const userId of [m.participant, architect, terminologist, m.facilitator]) {
      const board = await detailBoard(db, userId, m.projectId);
      if (!board.ok) throw new Error(board.error);
      expect(board.value.elements).toEqual([
        expect.objectContaining({ id: reference, reference: ZIB, codes: null }),
      ]);
      if (userId !== m.facilitator) expect(personLeaks(board, m)).toEqual([]);
    }
  });
});

describe("the codes count of the Overview (DT4, EL26)", () => {
  it("leaves a reference element out of the elements that take codes", async () => {
    expect(await detailProgress(db, m.projectId)).toMatchObject({ inModel: 1, codable: 0 });
  });
});
