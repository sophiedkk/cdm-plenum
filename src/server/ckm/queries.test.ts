// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Linking (EL4) and importing (EL7) CKM archetype elements on real PostgreSQL, with a fake CKM
// client on the blood pressure fixture and a negative test per role and per CKM failure.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { acceptInvitationsOnSignIn } from "../invitations/acceptance.ts";
import { invite } from "../invitations/queries.ts";
import { emailOf, facilitatorWithProject, groupId, insertUser } from "../test-fixtures.ts";
import type {
  CkmArchetype,
  CkmArchetypeElements,
  CkmClient,
  CkmFailure,
  CkmResult,
} from "./client.ts";
import { parseArchetypeXml } from "./parse.ts";
import {
  dataTypeForRmTypes,
  linkElement,
  linkRmType,
  listArchetypeElements,
  searchCkm,
} from "./queries.ts";
import { linkElementInput, searchCkmInput } from "./schemas.ts";
import { ckmFixture } from "./test-fixtures.ts";

const CID = "1013.1.3574";
const ARCHETYPE_ID = "openEHR-EHR-OBSERVATION.blood_pressure.v2";
const REVISION = "2.0.17";
const SYSTOLIC = "/data[at0001]/events[at0006]/data[at0003]/items[at0004]";
const LOCATION = "/protocol[at0011]/items[at0014]";

function bloodPressure(): CkmArchetypeElements {
  const parsed = parseArchetypeXml(ckmFixture("blood_pressure.v2.xml"));
  if (!parsed.ok) throw new Error(parsed.error);
  return {
    cid: CID,
    archetypeId: ARCHETYPE_ID,
    name: "Blood pressure",
    status: "PUBLISHED",
    revision: REVISION,
    originalLanguage: parsed.value.originalLanguage,
    elements: parsed.value.elements,
  };
}

/** A CKM client that answers from `archetype` or fails with `failure`, and counts its calls. */
class FakeCkm implements CkmClient {
  calls = 0;
  failure: CkmFailure | null = null;
  archetype: CkmArchetypeElements = bloodPressure();

  async searchArchetypes(): Promise<CkmResult<CkmArchetype[]>> {
    this.calls += 1;
    if (this.failure) return this.failure;
    const { cid, archetypeId, name, status, revision } = this.archetype;
    return { kind: "ok", value: [{ cid, archetypeId, name, status, revision }] };
  }

  async archetypeElements(): Promise<CkmResult<CkmArchetypeElements>> {
    this.calls += 1;
    if (this.failure) return this.failure;
    return { kind: "ok", value: this.archetype };
  }
}

let db: Kysely<DB>;
let ckm: FakeCkm;

beforeEach(async () => {
  db = await createTestDb();
  ckm = new FakeCkm();
});

afterEach(async () => {
  await db.destroy();
});

/** A project with a facilitator, a participant in "Nursing", an outsider and one element. */
async function setup() {
  const { userId: facilitator, projectId } = await facilitatorWithProject(db);
  const participant = await insertUser(db, "par");
  const invited = await invite(
    db,
    facilitator,
    {
      projectId,
      groupId: await groupId(db, projectId, "Nursing"),
      email: emailOf(participant),
    },
    { baseUrl: "http://localhost:3000", mailer: null, now: new Date() },
  );
  expect(invited.ok).toBe(true);
  await acceptInvitationsOnSignIn(db, participant, new Date());
  const outsider = await insertUser(db, "out");
  const elementId = await insertElement(projectId, "Upper pressure", "text");
  return { facilitator, participant, outsider, projectId, elementId };
}

async function insertElement(projectId: string, name: string, dataType: string | null = null) {
  const row = await db
    .insertInto("element")
    .values({ project_id: projectId, name, data_type: dataType })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

async function links() {
  return db.selectFrom("element_ckm_link").selectAll().execute();
}

const FAILURES: [CkmFailure, { error: string; status?: number }][] = [
  [{ kind: "unreachable" }, { error: "ckm_unreachable" }],
  [{ kind: "timeout" }, { error: "ckm_timeout" }],
  [
    { kind: "refused", status: 503 },
    { error: "ckm_refused", status: 503 },
  ],
  [{ kind: "unusable" }, { error: "ckm_unusable" }],
];

describe("linkRmType and dataTypeForRmTypes", () => {
  it("stores one type as is, a choice joined, and an open value as DATA_VALUE", () => {
    expect(linkRmType(["DV_QUANTITY"])).toBe("DV_QUANTITY");
    expect(linkRmType(["DV_CODED_TEXT", "DV_TEXT"])).toBe("DV_CODED_TEXT | DV_TEXT");
    expect(linkRmType([])).toBe("DATA_VALUE");
  });

  it("gives a data type key only for exactly one RM type in the list", () => {
    expect(dataTypeForRmTypes(["DV_QUANTITY"])).toBe("quantity");
    expect(dataTypeForRmTypes(["DV_INTERVAL<DV_QUANTITY>"])).toBe("quantity_interval");
    expect(dataTypeForRmTypes(["DV_PARSABLE"])).toBeNull();
    expect(dataTypeForRmTypes(["DV_CODED_TEXT", "DV_TEXT"])).toBeNull();
    expect(dataTypeForRmTypes([])).toBeNull();
  });
});

describe("searchCkm (EL4)", () => {
  it("returns the CKM rows to the facilitator", async () => {
    const { facilitator, projectId } = await setup();
    const result = await searchCkm(db, ckm, facilitator, { projectId, text: "bp", size: 10 });
    expect(result.ok && result.value[0]?.archetypeId).toBe(ARCHETYPE_ID);
  });

  it("refuses a participant and an outsider before calling CKM", async () => {
    const { participant, outsider, projectId } = await setup();
    const input = { projectId, text: "bp", size: 10 };
    expect(await searchCkm(db, ckm, participant, input)).toEqual({ ok: false, error: "forbidden" });
    expect(await searchCkm(db, ckm, outsider, input)).toEqual({ ok: false, error: "not_found" });
    expect(ckm.calls).toBe(0);
  });

  it("refuses an id that is no project", async () => {
    const { facilitator } = await setup();
    const input = { projectId: "no-such-project", text: "bp", size: 10 };
    expect(await searchCkm(db, ckm, facilitator, input)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it.each(FAILURES)("maps the CKM failure %o", async (failure, expected) => {
    const { facilitator, projectId } = await setup();
    ckm.failure = failure;
    const result = await searchCkm(db, ckm, facilitator, { projectId, text: "bp", size: 10 });
    expect(result).toEqual({ ok: false, ...expected });
  });
});

describe("listArchetypeElements (EL4, EL7)", () => {
  it("lists the elements with the data type each would get", async () => {
    const { facilitator, projectId } = await setup();
    const result = await listArchetypeElements(db, ckm, facilitator, { projectId, cid: CID });
    if (!result.ok) throw new Error(result.error);
    expect(result.value.revision).toBe(REVISION);
    expect(result.value.elements).toHaveLength(17);
    const byPath = new Map(result.value.elements.map((element) => [element.path, element]));
    expect(byPath.get(SYSTOLIC)?.dataType).toBe("quantity");
    expect(byPath.get(LOCATION)?.dataType).toBeNull();
  });

  it("refuses a participant and an outsider before calling CKM", async () => {
    const { participant, outsider, projectId } = await setup();
    const input = { projectId, cid: CID };
    expect(await listArchetypeElements(db, ckm, participant, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await listArchetypeElements(db, ckm, outsider, input)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(ckm.calls).toBe(0);
  });

  it.each(FAILURES)("maps the CKM failure %o", async (failure, expected) => {
    const { facilitator, projectId } = await setup();
    ckm.failure = failure;
    const result = await listArchetypeElements(db, ckm, facilitator, { projectId, cid: CID });
    expect(result).toEqual({ ok: false, ...expected });
  });
});

describe("linkElement (EL4)", () => {
  it("stores archetype ID, cid, revision, at-code, name and RM type, and sets the data type", async () => {
    const { facilitator, projectId, elementId } = await setup();
    const result = await linkElement(db, ckm, facilitator, {
      projectId,
      elementId,
      cid: CID,
      revision: REVISION,
      path: SYSTOLIC,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        elementId,
        archetypeId: ARCHETYPE_ID,
        revision: REVISION,
        atCode: "at0004",
        rmType: "DV_QUANTITY",
        dataType: "quantity",
      },
    });
    expect(await links()).toMatchObject([
      {
        element_id: elementId,
        archetype_id: ARCHETYPE_ID,
        cid: CID,
        revision: REVISION,
        at_code: "at0004",
        ckm_element_name: "Systolic",
        rm_type: "DV_QUANTITY",
      },
    ]);
    const element = await db
      .selectFrom("element")
      .select(["data_type", "name"])
      .where("id", "=", elementId)
      .executeTakeFirstOrThrow();
    expect(element).toEqual({ data_type: "quantity", name: "Upper pressure" });
    const logged = await db
      .selectFrom("activity_log")
      .select(["action", "target_id"])
      .where("action", "=", "element_ckm_linked")
      .execute();
    expect(logged).toEqual([{ action: "element_ckm_linked", target_id: elementId }]);
  });

  it("replaces an earlier link and keeps a type outside the list on the link only", async () => {
    const { facilitator, projectId, elementId } = await setup();
    const input = { projectId, elementId, cid: CID, revision: REVISION, path: SYSTOLIC };
    expect((await linkElement(db, ckm, facilitator, input)).ok).toBe(true);
    const relinked = await linkElement(db, ckm, facilitator, { ...input, path: LOCATION });
    expect(relinked.ok && relinked.value.rmType).toBe("DV_CODED_TEXT | DV_TEXT");
    expect(await links()).toMatchObject([
      { element_id: elementId, at_code: "at0014", rm_type: "DV_CODED_TEXT | DV_TEXT" },
    ]);
    const element = await db
      .selectFrom("element")
      .select("data_type")
      .where("id", "=", elementId)
      .executeTakeFirstOrThrow();
    expect(element.data_type).toBeNull();
  });

  it("refuses a link when CKM has a newer revision than the one picked", async () => {
    const { facilitator, projectId, elementId } = await setup();
    ckm.archetype = { ...ckm.archetype, revision: "2.0.18" };
    const result = await linkElement(db, ckm, facilitator, {
      projectId,
      elementId,
      cid: CID,
      revision: REVISION,
      path: SYSTOLIC,
    });
    expect(result).toEqual({ ok: false, error: "ckm_revision_changed" });
    expect(await links()).toEqual([]);
  });

  it("refuses a path that is no element of the archetype", async () => {
    const { facilitator, projectId, elementId } = await setup();
    const result = await linkElement(db, ckm, facilitator, {
      projectId,
      elementId,
      cid: CID,
      revision: REVISION,
      path: "/data[at0001]/items[at9999]",
    });
    expect(result).toEqual({ ok: false, error: "ckm_element_not_found" });
  });

  it("refuses an element of another project and a merged element", async () => {
    const { facilitator, projectId, elementId } = await setup();
    const other = await facilitatorWithProject(db, "other");
    const foreign = await insertElement(other.projectId, "Foreign");
    const input = { projectId, cid: CID, revision: REVISION, path: SYSTOLIC };
    expect(await linkElement(db, ckm, facilitator, { ...input, elementId: foreign })).toEqual({
      ok: false,
      error: "element_not_found",
    });
    const merged = await insertElement(projectId, "Duplicate");
    await db
      .updateTable("element")
      .set({ merged_into: elementId })
      .where("id", "=", merged)
      .execute();
    expect(await linkElement(db, ckm, facilitator, { ...input, elementId: merged })).toEqual({
      ok: false,
      error: "element_not_found",
    });
    expect(await links()).toEqual([]);
  });

  it("refuses a participant and an outsider before calling CKM", async () => {
    const { participant, outsider, projectId, elementId } = await setup();
    const input = { projectId, elementId, cid: CID, revision: REVISION, path: SYSTOLIC };
    expect(await linkElement(db, ckm, participant, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await linkElement(db, ckm, outsider, input)).toEqual({ ok: false, error: "not_found" });
    expect(ckm.calls).toBe(0);
    expect(await links()).toEqual([]);
  });

  it.each(FAILURES)("writes nothing on the CKM failure %o", async (failure, expected) => {
    const { facilitator, projectId, elementId } = await setup();
    ckm.failure = failure;
    const result = await linkElement(db, ckm, facilitator, {
      projectId,
      elementId,
      cid: CID,
      revision: REVISION,
      path: SYSTOLIC,
    });
    expect(result).toEqual({ ok: false, ...expected });
    expect(await links()).toEqual([]);
  });
});

describe("CKM input schemas", () => {
  const ids = { projectId: "11111111-1111-4111-8111-111111111111" };

  it("refuses an empty search and a size over the maximum", () => {
    expect(searchCkmInput.safeParse({ ...ids, text: "   " }).success).toBe(false);
    expect(searchCkmInput.safeParse({ ...ids, text: "bp", size: 51 }).success).toBe(false);
    expect(searchCkmInput.parse({ ...ids, text: " bp " })).toEqual({
      ...ids,
      text: "bp",
      size: 20,
    });
  });

  it("refuses a cid, revision or path that could leave the CKM path", () => {
    const valid = {
      ...ids,
      elementId: "0196f3a0-0000-7000-8000-000000000000",
      cid: CID,
      revision: REVISION,
      path: SYSTOLIC,
    };
    expect(linkElementInput.safeParse(valid).success).toBe(true);
    for (const change of [
      { cid: "1013.1.3574/../x" },
      { cid: "1013" },
      { revision: "2.0.17?x=1" },
      { path: "/data[at0001]/items[openEHR-EHR-CLUSTER.x.v1]" },
      { path: "data[at0001]" },
      { elementId: "not-a-uuid" },
    ]) {
      expect(linkElementInput.safeParse({ ...valid, ...change }).success).toBe(false);
    }
  });
});
