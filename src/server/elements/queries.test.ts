// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The element board on real PostgreSQL: adding (EL1), hidden authors (EL2, EL6, Q-ANON-1),
// editing and merging (EL5), proposed values (EL9), the CSV import (EL3), a negative test per
// role (Q-SEC-1) and an activity log with ids only (Q-PRIV-2).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CSV_MAX_BYTES } from "@/lib/element-csv";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { emailOf, facilitatorWithProject } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { revealBoard } from "./brainstorm.ts";
import { importCsv, previewCsvImport } from "./import.ts";
import {
  addElement,
  addElementComment,
  listElementComments,
  listElementCommentsWithAuthors,
  listElements,
  listElementsWithAuthors,
  mergeElements,
  setElementValues,
  updateElement,
} from "./queries.ts";
import {
  type AddElementInput,
  addElementInput,
  csvImportInput,
  mergeElementsInput,
  setElementValuesInput,
  updateElementInput,
} from "./schemas.ts";

let db: Kysely<DB>;
let m: ProjectMembers;

beforeEach(async () => {
  db = await createTestDb();
  // Participants add and comment in the discover phase (PR9).
  m = await projectWithMembers(db, "discover");
  // These tests cover the shared board after the reveal; brainstorm.test.ts covers the private
  // step before it (EL13).
  const revealed = await revealBoard(db, m.facilitator, m.projectId);
  if (!revealed.ok) throw new Error(revealed.error);
});

afterEach(async () => {
  await db.destroy();
});

const UNKNOWN_ID = "0190a8f0-0000-7000-8000-000000000000";

/** An element on the board of a second project that the test members have no role in. */
async function elsewhereElement(): Promise<string> {
  const { userId, projectId } = await facilitatorWithProject(db, "fac2");
  const added = await addElement(db, userId, addElementInput.parse({ projectId, name: "Other" }));
  if (!added.ok) throw new Error(added.error);
  return added.value.elementId;
}

/** Adds an element through the schema, as the server function does. */
async function add(
  userId: string,
  fields: Partial<Omit<AddElementInput, "projectId">> & { name: string },
): Promise<string> {
  const input = addElementInput.parse({ projectId: m.projectId, ...fields });
  const added = await addElement(db, userId, input);
  if (!added.ok) throw new Error(added.error);
  return added.value.elementId;
}

async function board(userId = m.participant) {
  const list = await listElements(db, userId, m.projectId);
  if (!list.ok) throw new Error(list.error);
  return list.value;
}

function update(elementId: string, fields: Record<string, unknown>) {
  return updateElementInput.parse({ projectId: m.projectId, elementId, ...fields });
}

function values(elementId: string, list: { text: string; value?: number | null }[]) {
  return setElementValuesInput.parse({ projectId: m.projectId, elementId, values: list });
}

describe("addElement (EL1)", () => {
  it("adds an element with only a name and a description, as brainstorm", async () => {
    const id = await add(m.participant, { name: "Systolic", description: "Peak pressure" });
    expect(await board()).toEqual([
      {
        id,
        name: "Systolic",
        description: "Peak pressure",
        dataType: null,
        cardinality: null,
        sources: [{ kind: "brainstorm", label: "" }],
        values: [],
        ckmLink: null,
        mergedCkmLinks: [],
        prompt: null,
        reference: null,
        commentCount: 0,
        createdAt: expect.any(String),
      },
    ]);
  });

  it("stores the optional data type, cardinality and source", async () => {
    await add(m.participant, {
      name: "Cuff size",
      dataType: "coded_text",
      cardinality: { min: 0, max: null },
      source: "Ward protocol",
    });
    const [element] = await board();
    expect(element).toMatchObject({
      dataType: "coded_text",
      cardinality: { min: 0, max: null },
      sources: [{ kind: "brainstorm", label: "Ward protocol" }],
    });
  });

  it("validates name, data type and cardinality before the query runs", () => {
    const parse = (fields: Record<string, unknown>) =>
      addElementInput.safeParse({ projectId: m.projectId, name: "A", ...fields }).success;
    expect(parse({})).toBe(true);
    expect(parse({ name: "   " })).toBe(false);
    expect(parse({ name: "x".repeat(201) })).toBe(false);
    expect(parse({ dataType: "DV_TEXT" })).toBe(false);
    expect(parse({ dataType: "decimal" })).toBe(false);
    expect(parse({ cardinality: { min: 2, max: 3 } })).toBe(false);
    expect(parse({ cardinality: { min: 1, max: 0 } })).toBe(false);
    expect(parse({ cardinality: { min: 0, max: 1.5 } })).toBe(false);
    expect(parse({ cardinality: { min: 1, max: 5 } })).toBe(true);
  });

  it("gives a non-member not_found", async () => {
    const input = addElementInput.parse({ projectId: m.projectId, name: "A" });
    expect(await addElement(db, m.outsider, input)).toEqual({ ok: false, error: "not_found" });
    expect(await listElements(db, m.outsider, m.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("authors (EL2, EL6)", () => {
  it("shows the facilitator the author of each element and comment", async () => {
    const id = await add(m.participant, { name: "Systolic" });
    await addElementComment(db, m.otherParticipant, {
      projectId: m.projectId,
      elementId: id,
      body: "Also diastolic?",
    });
    const list = await listElementsWithAuthors(db, m.facilitator, m.projectId);
    expect(list.ok && list.value[0]?.author?.email).toBe(emailOf(m.participant));
    const comments = await listElementCommentsWithAuthors(db, m.facilitator, {
      projectId: m.projectId,
      elementId: id,
    });
    expect(comments.ok && comments.value[0]?.author?.email).toBe(emailOf(m.otherParticipant));
  });

  it("refuses the authored lists to a participant with forbidden", async () => {
    const id = await add(m.participant, { name: "Systolic" });
    expect(await listElementsWithAuthors(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(
      await listElementCommentsWithAuthors(db, m.participant, {
        projectId: m.projectId,
        elementId: id,
      }),
    ).toEqual({ ok: false, error: "forbidden" });
  });

  it("names no person in any response a participant gets (Q-ANON-1)", async () => {
    const projectId = m.projectId;
    const responses: unknown[] = [];
    const record = <T>(response: T): T => {
      responses.push(response);
      return response;
    };
    const mine = record(
      await addElement(db, m.participant, addElementInput.parse({ projectId, name: "Mine" })),
    );
    const theirs = await add(m.otherParticipant, { name: "Theirs", description: "By another" });
    await add(m.facilitator, { name: "Facilitator's" });
    await addElementComment(db, m.otherParticipant, {
      projectId,
      elementId: theirs,
      body: "Other comment",
    });
    if (!mine.ok) throw new Error(mine.error);
    const elementId = mine.value.elementId;
    record(await addElementComment(db, m.participant, { projectId, elementId, body: "Mine" }));
    record(await listElements(db, m.participant, projectId));
    record(await listElementComments(db, m.participant, { projectId, elementId: theirs }));
    record(await listElementComments(db, m.participant, { projectId, elementId }));
    record(await listElementsWithAuthors(db, m.participant, projectId));
    record(await listElementCommentsWithAuthors(db, m.participant, { projectId, elementId }));
    expect(responses).toHaveLength(7);
    for (const response of responses) expect(personLeaks(response, m)).toEqual([]);
    // The check would catch an author: the facilitator's list does name one.
    expect(personLeaks(await listElementsWithAuthors(db, m.facilitator, projectId), m)).not.toEqual(
      [],
    );
  });
});

describe("CKM link on the board (EL4)", () => {
  it("shows every member the archetype, revision and at-code an element is linked to", async () => {
    const linked = await add(m.participant, { name: "Systolic" });
    await add(m.participant, { name: "Comment" });
    await db
      .insertInto("element_ckm_link")
      .values({
        element_id: linked,
        archetype_id: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
        cid: "1013.1.3574",
        revision: "2.0.17",
        at_code: "at0004",
        ckm_element_name: "Systolic",
        rm_type: "DV_QUANTITY",
      })
      .execute();
    expect((await board()).map((element) => element.ckmLink)).toEqual([
      {
        archetypeId: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
        cid: "1013.1.3574",
        revision: "2.0.17",
        atCode: "at0004",
        ckmElementName: "Systolic",
        rmType: "DV_QUANTITY",
      },
      null,
    ]);
  });
});

describe("CKM links of merged duplicates (EL5, O-5)", () => {
  const BP = "openEHR-EHR-OBSERVATION.blood_pressure.v2";
  let linkedAt = Date.parse("2026-11-01T09:00:00Z");

  /** Links an element to a blood pressure element; each call is linked a minute after the last. */
  async function link(elementId: string, atCode: string, revision = "2.0.17") {
    linkedAt += 60_000;
    await db
      .insertInto("element_ckm_link")
      .values({
        element_id: elementId,
        archetype_id: BP,
        cid: "1013.1.3574",
        revision,
        at_code: atCode,
        ckm_element_name: `Element ${atCode}`,
        rm_type: "DV_QUANTITY",
        linked_at: new Date(linkedAt),
      })
      .execute();
  }

  function expected(atCode: string, revision = "2.0.17") {
    return {
      archetypeId: BP,
      cid: "1013.1.3574",
      revision,
      atCode,
      ckmElementName: `Element ${atCode}`,
      rmType: "DV_QUANTITY",
    };
  }

  async function merge(intoId: string, fromIds: string[]) {
    const merged = await mergeElements(db, m.facilitator, {
      projectId: m.projectId,
      intoId,
      fromIds,
    });
    expect(merged).toEqual({ ok: true, value: null });
  }

  it("shows a duplicate's link on the result, which keeps no link of its own", async () => {
    const into = await add(m.participant, { name: "Systolic" });
    const from = await add(m.participant, { name: "Systolic BP" });
    await link(from, "at0004");
    await merge(into, [from]);
    const [result, ...rest] = await board();
    expect(rest).toEqual([]);
    expect(result?.ckmLink).toBeNull();
    expect(result?.mergedCkmLinks).toEqual([expected("at0004")]);
    const kept = await db.selectFrom("element_ckm_link").select("element_id").execute();
    expect(kept).toEqual([{ element_id: from }]);
  });

  it("keeps the result's own link and lists a different duplicate link beside it", async () => {
    const into = await add(m.participant, { name: "Systolic" });
    const from = await add(m.participant, { name: "Top pressure" });
    await link(into, "at0004");
    await link(from, "at0005", "2.0.16");
    await merge(into, [from]);
    const [result] = await board();
    expect(result?.ckmLink).toEqual(expected("at0004"));
    expect(result?.mergedCkmLinks).toEqual([expected("at0005", "2.0.16")]);
  });

  it("follows two merges, in the order the links were made, and lists a repeated link once", async () => {
    const a = await add(m.participant, { name: "A" });
    const b = await add(m.participant, { name: "B" });
    const c = await add(m.participant, { name: "C" });
    const d = await add(m.participant, { name: "D" });
    await link(c, "at0005");
    await link(b, "at0004");
    await link(d, "at0004");
    await merge(b, [c]);
    await merge(a, [b, d]);
    const [result, ...rest] = await board();
    expect(rest).toEqual([]);
    expect(result?.ckmLink).toBeNull();
    expect(result?.mergedCkmLinks).toEqual([expected("at0005"), expected("at0004")]);
  });

  it("walks a merged_into chain to any depth", async () => {
    const a = await add(m.participant, { name: "A" });
    const b = await add(m.participant, { name: "B" });
    const c = await add(m.participant, { name: "C" });
    await link(c, "at0005");
    // A chain the merge itself never writes, so the walk does not rely on the flattening.
    await db.updateTable("element").set({ merged_into: a }).where("id", "=", b).execute();
    await db.updateTable("element").set({ merged_into: b }).where("id", "=", c).execute();
    expect((await board()).map((e) => [e.id, e.mergedCkmLinks])).toEqual([
      [a, [expected("at0005")]],
    ]);
  });

  it("gives an empty list when no element has a link, and to the facilitator's list too", async () => {
    const into = await add(m.participant, { name: "Systolic" });
    const from = await add(m.participant, { name: "Systolic BP" });
    const other = await add(m.participant, { name: "Diastolic" });
    await link(other, "at0005");
    await merge(into, [from]);
    expect((await board()).map((e) => e.mergedCkmLinks)).toEqual([[], []]);
    const authored = await listElementsWithAuthors(db, m.facilitator, m.projectId);
    expect(authored.ok && authored.value.map((e) => e.mergedCkmLinks)).toEqual([[], []]);
  });

  it("shows the facilitator the same provenance as a participant", async () => {
    const into = await add(m.participant, { name: "Systolic" });
    const from = await add(m.participant, { name: "Systolic BP" });
    await link(from, "at0004");
    await merge(into, [from]);
    const authored = await listElementsWithAuthors(db, m.facilitator, m.projectId);
    expect(authored.ok && authored.value[0]?.mergedCkmLinks).toEqual([expected("at0004")]);
  });
});

describe("comments (EL6)", () => {
  it("lists the comments under the element, oldest first, and counts them on the board", async () => {
    const id = await add(m.participant, { name: "Systolic" });
    for (const body of ["First", "Second"]) {
      const added = await addElementComment(db, m.participant, {
        projectId: m.projectId,
        elementId: id,
        body,
      });
      expect(added.ok).toBe(true);
    }
    const list = await listElementComments(db, m.otherParticipant, {
      projectId: m.projectId,
      elementId: id,
    });
    expect(list.ok && list.value.map((c) => c.body)).toEqual(["First", "Second"]);
    expect((await board())[0]?.commentCount).toBe(2);
  });

  it("tells the reader which comments are their own and nothing more about the author", async () => {
    const id = await add(m.participant, { name: "Systolic" });
    const input = { projectId: m.projectId, elementId: id };
    await addElementComment(db, m.participant, { ...input, body: "Mine" });
    await addElementComment(db, m.otherParticipant, { ...input, body: "Theirs" });
    const forParticipant = await listElementComments(db, m.participant, input);
    expect(forParticipant.ok && forParticipant.value.map((c) => [c.body, c.mine])).toEqual([
      ["Mine", true],
      ["Theirs", false],
    ]);
    const forOther = await listElementComments(db, m.otherParticipant, input);
    expect(forOther.ok && forOther.value.map((c) => c.mine)).toEqual([false, true]);
    expect(personLeaks([forParticipant, forOther], m)).toEqual([]);
  });

  it("refuses an element of another project or none with element_not_found", async () => {
    for (const elementId of [UNKNOWN_ID, await elsewhereElement()]) {
      const input = { projectId: m.projectId, elementId };
      expect(await addElementComment(db, m.participant, { ...input, body: "x" })).toEqual({
        ok: false,
        error: "element_not_found",
      });
      expect(await listElementComments(db, m.participant, input)).toEqual({
        ok: false,
        error: "element_not_found",
      });
      expect(await listElementCommentsWithAuthors(db, m.facilitator, input)).toEqual({
        ok: false,
        error: "element_not_found",
      });
    }
  });

  it("gives a non-member not_found", async () => {
    const id = await add(m.participant, { name: "Systolic" });
    const input = { projectId: m.projectId, elementId: id };
    expect(await addElementComment(db, m.outsider, { ...input, body: "x" })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await listElementComments(db, m.outsider, input)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await listElementCommentsWithAuthors(db, m.outsider, input)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("updateElement (EL5)", () => {
  it("lets the facilitator edit the wording, data type and cardinality", async () => {
    const id = await add(m.participant, { name: "systolic bp" });
    const result = await updateElement(
      db,
      m.facilitator,
      update(id, {
        name: "Systolic",
        description: "Peak arterial pressure",
        dataType: "quantity",
        cardinality: { min: 0, max: 1 },
      }),
    );
    expect(result).toEqual({ ok: true, value: null });
    expect((await board())[0]).toMatchObject({
      name: "Systolic",
      description: "Peak arterial pressure",
      dataType: "quantity",
      cardinality: { min: 0, max: 1 },
    });
  });

  it("refuses a participant with forbidden and a non-member with not_found", async () => {
    const id = await add(m.participant, { name: "Mine" });
    expect(await updateElement(db, m.participant, update(id, { name: "Changed" }))).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await updateElement(db, m.outsider, update(id, { name: "Changed" }))).toEqual({
      ok: false,
      error: "not_found",
    });
    expect((await board())[0]?.name).toBe("Mine");
  });

  it("refuses an unknown element with element_not_found", async () => {
    expect(await updateElement(db, m.facilitator, update(UNKNOWN_ID, { name: "X" }))).toEqual({
      ok: false,
      error: "element_not_found",
    });
  });

  it("refuses a data type that no longer fits the proposed values", async () => {
    const id = await add(m.facilitator, { name: "Pain", dataType: "ordinal" });
    await setElementValues(db, m.facilitator, values(id, [{ text: "None", value: 0 }]));
    for (const dataType of ["text", "coded_text", null]) {
      expect(
        await updateElement(db, m.facilitator, update(id, { name: "Pain", dataType })),
      ).toEqual({ ok: false, error: "element_has_values" });
    }
    expect(
      (await updateElement(db, m.facilitator, update(id, { name: "Pain", dataType: "scale" }))).ok,
    ).toBe(true);
  });
});

describe("setElementValues (EL9)", () => {
  it("stores an ordered list with numbers for an ordinal element", async () => {
    const id = await add(m.facilitator, { name: "Pain", dataType: "ordinal" });
    const list = [
      { text: "None", value: 0 },
      { text: "Mild", value: 1 },
      { text: "Severe", value: 3 },
    ];
    expect(await setElementValues(db, m.facilitator, values(id, list))).toEqual({
      ok: true,
      value: null,
    });
    expect((await board())[0]?.values).toEqual(list);
    await setElementValues(
      db,
      m.facilitator,
      values(
        id,
        [list[2], list[0]].filter((v) => !!v),
      ),
    );
    expect((await board())[0]?.values.map((v) => v.text)).toEqual(["Severe", "None"]);
    await setElementValues(db, m.facilitator, values(id, []));
    expect((await board())[0]?.values).toEqual([]);
  });

  it("stores real numbers for a scale and text only for coded text", async () => {
    const scale = await add(m.facilitator, { name: "Borg", dataType: "scale" });
    const coded = await add(m.facilitator, { name: "Cuff", dataType: "coded_text" });
    expect(
      (
        await setElementValues(
          db,
          m.facilitator,
          values(scale, [{ text: "Very slight", value: 0.5 }]),
        )
      ).ok,
    ).toBe(true);
    expect(
      (
        await setElementValues(
          db,
          m.facilitator,
          values(coded, [{ text: "Adult" }, { text: "Child" }]),
        )
      ).ok,
    ).toBe(true);
    const [b, c] = await board();
    expect(b?.values).toEqual([{ text: "Very slight", value: 0.5 }]);
    expect(c?.values).toEqual([
      { text: "Adult", value: null },
      { text: "Child", value: null },
    ]);
  });

  it("refuses values that do not fit the data type", async () => {
    const text = await add(m.facilitator, { name: "Note", dataType: "text" });
    const none = await add(m.facilitator, { name: "Undecided" });
    const coded = await add(m.facilitator, { name: "Cuff", dataType: "coded_text" });
    const ordinal = await add(m.facilitator, { name: "Pain", dataType: "ordinal" });
    const scale = await add(m.facilitator, { name: "Borg", dataType: "scale" });
    const cases: [string, { text: string; value?: number | null }[], string][] = [
      [text, [{ text: "A" }], "values_not_allowed"],
      [none, [{ text: "A" }], "values_not_allowed"],
      [coded, [{ text: "A", value: 1 }], "value_number_not_allowed"],
      [ordinal, [{ text: "A" }], "value_number_required"],
      [scale, [{ text: "A", value: null }], "value_number_required"],
      [ordinal, [{ text: "A", value: 1.5 }], "value_number_not_integer"],
    ];
    for (const [elementId, list, error] of cases) {
      expect(await setElementValues(db, m.facilitator, values(elementId, list))).toEqual({
        ok: false,
        error,
      });
    }
  });

  it("refuses a participant, a non-member and an unknown element", async () => {
    const id = await add(m.facilitator, { name: "Cuff", dataType: "coded_text" });
    const input = values(id, [{ text: "Adult" }]);
    expect(await setElementValues(db, m.participant, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await setElementValues(db, m.outsider, input)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await setElementValues(db, m.facilitator, values(UNKNOWN_ID, []))).toEqual({
      ok: false,
      error: "element_not_found",
    });
  });
});

describe("mergeElements (EL5)", () => {
  async function duplicates() {
    const into = await add(m.participant, {
      name: "Systolic",
      description: "Peak pressure",
      dataType: "coded_text",
      source: "Ward A",
    });
    const from = await add(m.otherParticipant, {
      name: "Systolic BP",
      description: "Highest pressure in the cycle",
      source: "Ward B",
    });
    await setElementValues(db, m.facilitator, values(into, [{ text: "High" }]));
    await addElementComment(db, m.participant, {
      projectId: m.projectId,
      elementId: into,
      body: "On the result",
    });
    await addElementComment(db, m.otherParticipant, {
      projectId: m.projectId,
      elementId: from,
      body: "On the duplicate",
    });
    return { into, from };
  }

  it("keeps both descriptions, sources and comments on the result", async () => {
    const { into, from } = await duplicates();
    expect(
      await mergeElements(db, m.facilitator, {
        projectId: m.projectId,
        intoId: into,
        fromIds: [from],
      }),
    ).toEqual({ ok: true, value: null });
    const after = await board();
    expect(after.map((e) => e.id)).toEqual([into]);
    expect(after[0]).toMatchObject({
      description: "Peak pressure\n\nHighest pressure in the cycle",
      sources: [
        { kind: "brainstorm", label: "Ward A" },
        { kind: "brainstorm", label: "Ward B" },
      ],
      values: [{ text: "High", value: null }],
      commentCount: 2,
    });
    const comments = await listElementComments(db, m.participant, {
      projectId: m.projectId,
      elementId: into,
    });
    expect(comments.ok && comments.value.map((c) => c.body)).toEqual([
      "On the result",
      "On the duplicate",
    ]);
    const merged = await db
      .selectFrom("element")
      .select("merged_into")
      .where("id", "=", from)
      .executeTakeFirstOrThrow();
    expect(merged.merged_into).toBe(into);
  });

  it("merges three elements and moves their proposed values after the result's", async () => {
    const a = await add(m.facilitator, { name: "Pain", dataType: "ordinal", description: "Same" });
    const b = await add(m.facilitator, {
      name: "Pain score",
      dataType: "ordinal",
      description: "Same",
    });
    const c = await add(m.facilitator, { name: "Pain level", dataType: "ordinal" });
    await setElementValues(db, m.facilitator, values(a, [{ text: "None", value: 0 }]));
    await setElementValues(db, m.facilitator, values(b, [{ text: "Mild", value: 1 }]));
    await setElementValues(db, m.facilitator, values(c, [{ text: "Severe", value: 3 }]));
    const merged = await mergeElements(db, m.facilitator, {
      projectId: m.projectId,
      intoId: a,
      fromIds: [b, c],
    });
    expect(merged.ok).toBe(true);
    const [result, ...rest] = await board();
    expect(rest).toEqual([]);
    expect(result?.description).toBe("Same");
    expect(result?.values.map((v) => v.text)).toEqual(["None", "Mild", "Severe"]);
  });

  it("points elements merged earlier into a duplicate at the new result", async () => {
    const a = await add(m.facilitator, { name: "A" });
    const b = await add(m.facilitator, { name: "B" });
    const c = await add(m.facilitator, { name: "C" });
    await mergeElements(db, m.facilitator, { projectId: m.projectId, intoId: b, fromIds: [c] });
    await mergeElements(db, m.facilitator, { projectId: m.projectId, intoId: a, fromIds: [b] });
    const rows = await db
      .selectFrom("element")
      .select(["name", "merged_into"])
      .where("project_id", "=", m.projectId)
      .orderBy("name")
      .execute();
    expect(rows).toEqual([
      { name: "A", merged_into: null },
      { name: "B", merged_into: a },
      { name: "C", merged_into: a },
    ]);
  });

  it("refuses values that do not fit the result and leaves every element as it was", async () => {
    const into = await add(m.facilitator, { name: "Cuff", dataType: "coded_text" });
    const from = await add(m.facilitator, { name: "Pain", dataType: "ordinal" });
    await setElementValues(db, m.facilitator, values(from, [{ text: "Mild", value: 1 }]));
    await addElementComment(db, m.participant, {
      projectId: m.projectId,
      elementId: from,
      body: "Stays",
    });
    const before = await board();
    expect(
      await mergeElements(db, m.facilitator, {
        projectId: m.projectId,
        intoId: into,
        fromIds: [from],
      }),
    ).toEqual({ ok: false, error: "merge_values_conflict" });
    expect(await board()).toEqual(before);
  });

  it("refuses an element that is in a round", async () => {
    const { into, from } = await duplicates();
    const round = await db
      .insertInto("round")
      .values({ project_id: m.projectId, number: 1, closes_at: new Date("2027-01-01") })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db.insertInto("round_element").values({ round_id: round.id, element_id: from }).execute();
    expect(
      await mergeElements(db, m.facilitator, {
        projectId: m.projectId,
        intoId: into,
        fromIds: [from],
      }),
    ).toEqual({ ok: false, error: "element_in_round" });
  });

  it("refuses an unknown, merged or other project's element with element_not_found", async () => {
    const { into, from } = await duplicates();
    const input = (intoId: string, fromIds: string[]) => ({
      projectId: m.projectId,
      intoId,
      fromIds,
    });
    for (const other of [UNKNOWN_ID, await elsewhereElement()]) {
      expect(await mergeElements(db, m.facilitator, input(into, [other]))).toEqual({
        ok: false,
        error: "element_not_found",
      });
    }
    expect((await mergeElements(db, m.facilitator, input(into, [from]))).ok).toBe(true);
    expect(await mergeElements(db, m.facilitator, input(into, [from]))).toEqual({
      ok: false,
      error: "element_not_found",
    });
    expect(await mergeElements(db, m.facilitator, input(from, [into]))).toEqual({
      ok: false,
      error: "element_not_found",
    });
  });

  it("refuses a participant and a non-member", async () => {
    const { into, from } = await duplicates();
    const input = { projectId: m.projectId, intoId: into, fromIds: [from] };
    expect(await mergeElements(db, m.participant, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await mergeElements(db, m.outsider, input)).toEqual({ ok: false, error: "not_found" });
  });

  it("needs at least one other element, each once, never the result itself", () => {
    const parse = (intoId: string, fromIds: string[]) =>
      mergeElementsInput.safeParse({ projectId: m.projectId, intoId, fromIds }).success;
    const a = "0190a8f0-0000-7000-8000-00000000000a";
    const b = "0190a8f0-0000-7000-8000-00000000000b";
    expect(parse(a, [b])).toBe(true);
    expect(parse(a, [])).toBe(false);
    expect(parse(a, [b, b])).toBe(false);
    expect(parse(a, [a, b])).toBe(false);
  });
});

describe("CSV import (EL3)", () => {
  const file = [
    "name;description;data_type;cardinality",
    "Systolic;Peak pressure;quantity;1..1",
    ";A row without a name;;",
    "Cuff size;Size of the cuff;DV_CODED_TEXT;0..1",
  ].join("\n");
  const input = () => ({ projectId: m.projectId, fileName: "ward-list.csv", content: file });

  it("previews accepted and refused rows without writing", async () => {
    const preview = await previewCsvImport(db, m.facilitator, input());
    if (!preview.ok || !preview.value.ok) throw new Error("preview refused");
    expect(preview.value.accepted.map((row) => row.name)).toEqual(["Systolic", "Cuff size"]);
    expect(preview.value.refused).toEqual([{ line: 3, reason: "name_missing" }]);
    expect(await board()).toEqual([]);
  });

  it("adds one element per accepted row with the file name as its csv source", async () => {
    const imported = await importCsv(db, m.facilitator, input());
    if (!imported.ok || !imported.value.ok) throw new Error("import refused");
    expect(imported.value.elementIds).toHaveLength(2);
    expect(imported.value.refused).toEqual([{ line: 3, reason: "name_missing" }]);
    const elements = await board();
    expect(elements.map((e) => [e.name, e.dataType, e.cardinality, e.sources])).toEqual([
      ["Systolic", "quantity", { min: 1, max: 1 }, [{ kind: "csv", label: "ward-list.csv" }]],
      ["Cuff size", "coded_text", { min: 0, max: 1 }, [{ kind: "csv", label: "ward-list.csv" }]],
    ]);
    const logged = await db
      .selectFrom("activity_log")
      .select("target_id")
      .where("action", "=", "element_imported")
      .execute();
    expect(logged.map((row) => row.target_id).sort()).toEqual(
      [...imported.value.elementIds].sort(),
    );
  });

  it("writes nothing for a file the reader refuses", async () => {
    const imported = await importCsv(db, m.facilitator, {
      ...input(),
      content: "title,description\nA,a\n",
    });
    expect(imported).toEqual({
      ok: true,
      value: { ok: false, error: "missing_name_column", line: 1 },
    });
    expect(await board()).toEqual([]);
  });

  it("writes nothing when every row is refused", async () => {
    const imported = await importCsv(db, m.facilitator, {
      ...input(),
      content: "name,description\n,a\n",
    });
    expect(imported.ok && imported.value.ok && imported.value.elementIds).toEqual([]);
    expect(await board()).toEqual([]);
  });

  it("needs a file name and caps the content before the query runs", () => {
    expect(csvImportInput.safeParse(input()).success).toBe(true);
    expect(csvImportInput.safeParse({ ...input(), fileName: " " }).success).toBe(false);
    expect(
      csvImportInput.safeParse({ ...input(), content: "x".repeat(CSV_MAX_BYTES + 1) }).success,
    ).toBe(false);
  });

  it("refuses a participant with forbidden and a non-member with not_found", async () => {
    for (const fn of [previewCsvImport, importCsv]) {
      expect(await fn(db, m.participant, input())).toEqual({ ok: false, error: "forbidden" });
      expect(await fn(db, m.outsider, input())).toEqual({ ok: false, error: "not_found" });
    }
    expect(await board()).toEqual([]);
  });
});

describe("activity log (Q-PRIV-2)", () => {
  it("records every write with ids only, never an element text, a comment or a name", async () => {
    const projectId = m.projectId;
    const a = await add(m.participant, {
      name: "SecretName",
      description: "SecretDescription",
      dataType: "coded_text",
      source: "SecretSource",
    });
    const b = await add(m.participant, { name: "OtherName" });
    await addElementComment(db, m.participant, { projectId, elementId: a, body: "SecretComment" });
    await updateElement(
      db,
      m.facilitator,
      update(a, { name: "SecretEdit", dataType: "coded_text" }),
    );
    await setElementValues(db, m.facilitator, values(a, [{ text: "SecretValue" }]));
    await mergeElements(db, m.facilitator, { projectId, intoId: a, fromIds: [b] });
    await importCsv(db, m.facilitator, {
      projectId,
      fileName: "SecretFile.csv",
      content: "name,description\nSecretRow,x\n",
    });
    const rows = await db
      .selectFrom("activity_log")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("action", "like", "element%")
      .execute();
    expect(rows.map((row) => row.action).sort()).toEqual(
      [
        "element_added",
        "element_added",
        "element_comment_added",
        "element_updated",
        "element_values_set",
        "element_merged",
        "element_merge_result",
        "element_imported",
      ].sort(),
    );
    const text = JSON.stringify(rows);
    expect(text).not.toMatch(/Secret|OtherName|example\.test/);
  });
});
