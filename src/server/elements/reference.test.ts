// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The reference element on real PostgreSQL (EL26, ADR 0021): adding and editing one, every
// refusal of a reference with a data type, values, a merge or a kind change, the database checks
// and triggers behind them, and the anonymity boundary (EL2, Q-ANON-1).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { z } from "zod";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { closedRoundWithOutcomes, setPhase } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { revealBoard } from "./brainstorm.ts";
import { brainstormBoard } from "./brainstorm-board.ts";
import {
  addElement,
  listElements,
  listOwnElements,
  mergeElements,
  setElementValues,
  updateElement,
} from "./queries.ts";
import { addElementInput, setElementValuesInput, updateElementInput } from "./schemas.ts";

let db: Kysely<DB>;
let m: ProjectMembers;

const ZIB = { title: "Zib Bloeddruk", url: "https://models.example.test/zib/bloeddruk" };

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db, "discover");
  const revealed = await revealBoard(db, m.facilitator, m.projectId);
  if (!revealed.ok) throw new Error(revealed.error);
});

afterEach(async () => {
  await db.destroy();
});

function input(fields: Omit<z.input<typeof addElementInput>, "projectId">) {
  return addElementInput.parse({ projectId: m.projectId, ...fields });
}

async function add(userId: string, fields: Parameters<typeof input>[0]): Promise<string> {
  const added = await addElement(db, userId, input(fields));
  if (!added.ok) throw new Error(added.error);
  return added.value.elementId;
}

function update(elementId: string, fields: Record<string, unknown>) {
  return updateElementInput.parse({ projectId: m.projectId, elementId, ...fields });
}

async function board(userId = m.participant) {
  const list = await listElements(db, userId, m.projectId);
  if (!list.ok) throw new Error(list.error);
  return list.value;
}

describe("adding a reference element (EL26)", () => {
  it("lets a participant add one in discover, which every member reads with its model", async () => {
    const id = await add(m.participant, {
      name: "Blood pressure",
      cardinality: { min: 0, max: 1 },
      reference: ZIB,
    });
    for (const reader of [m.participant, m.otherParticipant, m.facilitator]) {
      expect((await board(reader)).find((element) => element.id === id)).toMatchObject({
        name: "Blood pressure",
        dataType: null,
        cardinality: { min: 0, max: 1 },
        values: [],
        reference: ZIB,
      });
    }
  });

  it("lets the facilitator add one from the board, with a title and no link", async () => {
    await setPhase(db, m.projectId, "decide");
    const id = await add(m.facilitator, {
      name: "Body weight",
      reference: { title: "Archetype for body weight" },
    });
    const [element] = await board(m.facilitator);
    expect(element).toMatchObject({
      id,
      reference: { title: "Archetype for body weight", url: null },
    });
  });

  it("keeps an ordinary element a data element without a reference", async () => {
    await add(m.participant, { name: "Systolic" });
    expect((await board())[0]?.reference).toBeNull();
  });

  it("refuses a reference with a data type with reference_data_type and adds nothing", async () => {
    for (const userId of [m.participant, m.facilitator]) {
      const result = await addElement(
        db,
        userId,
        input({ name: "Blood pressure", dataType: "quantity", reference: ZIB }),
      );
      expect(result).toEqual({ ok: false, error: "reference_data_type" });
    }
    expect(await board(m.facilitator)).toEqual([]);
  });

  it("refuses a participant outside discover with phase_closed, as any element", async () => {
    await setPhase(db, m.projectId, "decide");
    const result = await addElement(
      db,
      m.participant,
      input({ name: "Blood pressure", reference: ZIB }),
    );
    expect(result).toEqual({ ok: false, error: "phase_closed" });
  });

  it("needs a title and an http or https link before the query runs", () => {
    const parse = (reference: unknown) =>
      addElementInput.safeParse({ projectId: m.projectId, name: "Blood pressure", reference })
        .success;
    expect(parse({ title: "" })).toBe(false);
    expect(parse({ title: "   " })).toBe(false);
    expect(parse({ title: "x".repeat(301) })).toBe(false);
    expect(parse({ title: "Zib", url: "javascript:alert(1)" })).toBe(false);
    expect(parse({ title: "Zib", url: "ftp://models.example.test" })).toBe(false);
    expect(parse({ title: "Zib", url: `https://example.test/${"x".repeat(2000)}` })).toBe(false);
    expect(parse({ title: "Zib", url: "http://models.example.test/zib" })).toBe(true);
    expect(parse(null)).toBe(true);
  });
});

describe("editing a reference element (EL5, EL26)", () => {
  it("lets the facilitator turn a data element into a reference and back", async () => {
    const id = await add(m.participant, { name: "Blood pressure" });
    const toReference = await updateElement(
      db,
      m.facilitator,
      update(id, { name: "Blood pressure", reference: ZIB }),
    );
    expect(toReference).toEqual({ ok: true, value: null });
    expect((await board())[0]?.reference).toEqual(ZIB);
    const back = await updateElement(db, m.facilitator, update(id, { name: "Blood pressure" }));
    expect(back).toEqual({ ok: true, value: null });
    expect((await board())[0]?.reference).toBeNull();
  });

  it("refuses a reference with a data type with reference_data_type", async () => {
    const id = await add(m.participant, { name: "Blood pressure", reference: ZIB });
    const result = await updateElement(
      db,
      m.facilitator,
      update(id, { name: "Blood pressure", dataType: "quantity", reference: ZIB }),
    );
    expect(result).toEqual({ ok: false, error: "reference_data_type" });
  });

  it("refuses a reference for an element with proposed values with element_has_values", async () => {
    const id = await add(m.participant, { name: "Position", dataType: "coded_text" });
    const set = await setElementValues(
      db,
      m.facilitator,
      setElementValuesInput.parse({
        projectId: m.projectId,
        elementId: id,
        values: [{ text: "Sitting" }],
      }),
    );
    expect(set.ok).toBe(true);
    const result = await updateElement(
      db,
      m.facilitator,
      update(id, { name: "Position", reference: ZIB }),
    );
    expect(result).toEqual({ ok: false, error: "element_has_values" });
    expect((await board())[0]?.reference).toBeNull();
  });

  it("refuses a kind change of an element with a detail proposal with element_kind_locked", async () => {
    const id = await add(m.participant, { name: "Blood pressure" });
    await closedRoundWithOutcomes(db, m.projectId, [[id, "included"]]);
    await db
      .insertInto("detail_proposal")
      .values({ element_id: id, min_occurs: 0, max_occurs: 1 })
      .execute();
    const result = await updateElement(
      db,
      m.facilitator,
      update(id, { name: "Blood pressure", reference: ZIB }),
    );
    expect(result).toEqual({ ok: false, error: "element_kind_locked" });
    // Within its kind the element still takes edits.
    const renamed = await updateElement(db, m.facilitator, update(id, { name: "Pressure" }));
    expect(renamed).toEqual({ ok: true, value: null });
  });

  it("refuses values for a reference with values_not_allowed", async () => {
    const id = await add(m.participant, { name: "Blood pressure", reference: ZIB });
    const result = await setElementValues(
      db,
      m.facilitator,
      setElementValuesInput.parse({
        projectId: m.projectId,
        elementId: id,
        values: [{ text: "High" }],
      }),
    );
    expect(result).toEqual({ ok: false, error: "values_not_allowed" });
  });

  it("refuses a participant with forbidden", async () => {
    const id = await add(m.participant, { name: "Blood pressure" });
    const result = await updateElement(
      db,
      m.participant,
      update(id, { name: "Blood pressure", reference: ZIB }),
    );
    expect(result).toEqual({ ok: false, error: "forbidden" });
  });
});

describe("merging a reference element (EL5, EL26)", () => {
  it("refuses a merge of a reference and a data element with merge_kind_conflict", async () => {
    const reference = await add(m.participant, { name: "Blood pressure", reference: ZIB });
    const data = await add(m.participant, { name: "Systolic" });
    const result = await mergeElements(db, m.facilitator, {
      projectId: m.projectId,
      intoId: reference,
      fromIds: [data],
    });
    expect(result).toEqual({ ok: false, error: "merge_kind_conflict" });
    expect(await board()).toHaveLength(2);
  });

  it("merges two references into the one that stays, with its model", async () => {
    const first = await add(m.participant, { name: "Blood pressure", reference: ZIB });
    const second = await add(m.otherParticipant, {
      name: "BP",
      reference: { title: "Another blood pressure model" },
    });
    const result = await mergeElements(db, m.facilitator, {
      projectId: m.projectId,
      intoId: first,
      fromIds: [second],
    });
    expect(result).toEqual({ ok: true, value: null });
    expect((await board()).map((element) => element.reference)).toEqual([ZIB]);
  });
});

describe("the database checks of a reference (EL26)", () => {
  /** Runs `work` in a savepoint and expects the database to refuse it with `message`. */
  const refused = (work: (trx: Kysely<DB>) => Promise<unknown>, message: RegExp) =>
    expect(db.transaction().execute(work)).rejects.toThrow(message);

  const insert = (trx: Kysely<DB>, values: Record<string, unknown>) =>
    trx
      .insertInto("element")
      .values({ project_id: m.projectId, name: "Blood pressure", ...values })
      .returning("id")
      .executeTakeFirstOrThrow();

  const REFERENCE = { kind: "reference", reference_title: "Zib" };

  it("refuses a reference without a title, a title on a data element and an unknown kind", async () => {
    await refused((trx) => insert(trx, { kind: "reference" }), /element_reference_check/);
    await refused(
      (trx) => insert(trx, { kind: "reference", reference_title: " " }),
      /element_reference_check/,
    );
    await refused((trx) => insert(trx, { reference_title: "Zib" }), /element_reference_check/);
    await refused((trx) => insert(trx, { kind: "group" }), /element_kind_check/);
  });

  it("refuses a link that is not http or https", async () => {
    await refused(
      (trx) => insert(trx, { ...REFERENCE, reference_url: "javascript:alert(1)" }),
      /element_reference_check/,
    );
  });

  it("refuses a data type, a code or a binding on a reference", async () => {
    for (const values of [
      { data_type: "quantity" },
      { code_system: "http://loinc.org", code: "1" },
      { binding_strength: "required" },
    ]) {
      await refused(
        (trx) => insert(trx, { ...REFERENCE, ...values }),
        /element_reference_fields_check/,
      );
    }
  });

  it("refuses values on a reference, and a reference for an element with values", async () => {
    const reference = await insert(db, REFERENCE);
    await refused(
      (trx) =>
        trx
          .insertInto("element_value")
          .values({ element_id: reference.id, position: 0, text: "High" })
          .execute(),
      /reference_values/,
    );
    const data = await insert(db, { data_type: "coded_text" });
    await db
      .insertInto("element_value")
      .values({ element_id: data.id, position: 0, text: "Sitting" })
      .execute();
    await refused(
      (trx) =>
        trx
          .updateTable("element")
          .set({ kind: "reference", data_type: null, reference_title: "Zib" })
          .where("id", "=", data.id)
          .execute(),
      /reference_has_details/,
    );
  });

  it("refuses a code proposal and a structure with a data type or values for a reference", async () => {
    const reference = await insert(db, REFERENCE);
    await refused(
      (trx) =>
        trx
          .insertInto("detail_proposal")
          .values({ element_id: reference.id, kind: "terminology", review_state: "pending" })
          .execute(),
      /reference_details/,
    );
    await refused(
      (trx) =>
        trx
          .insertInto("detail_proposal")
          .values({ element_id: reference.id, data_type: "quantity" })
          .execute(),
      /reference_details/,
    );
    const proposal = await db
      .insertInto("detail_proposal")
      .values({ element_id: reference.id, min_occurs: 0, max_occurs: 1 })
      .returning("id")
      .executeTakeFirstOrThrow();
    await refused(
      (trx) =>
        trx
          .insertInto("detail_proposal_value")
          .values({ proposal_id: proposal.id, position: 0, text: "High" })
          .execute(),
      /reference_values/,
    );
  });
});

describe("anonymity (EL2, Q-ANON-1)", () => {
  it("names no person in any response a participant gets about a reference", async () => {
    await add(m.otherParticipant, { name: "Blood pressure", reference: ZIB });
    await add(m.facilitator, { name: "Body weight", reference: { title: "Body weight" } });
    const responses = [
      await addElement(db, m.participant, input({ name: "Mine", reference: ZIB })),
      await listElements(db, m.participant, m.projectId),
      await listOwnElements(db, m.participant, m.projectId),
      await brainstormBoard(db, m.participant, m.projectId),
    ];
    for (const response of responses) {
      expect(response.ok).toBe(true);
      expect(personLeaks(response, m)).toEqual([]);
    }
  });
});
