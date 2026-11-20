// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Source models on real PostgreSQL (EL12, EL7, EL11, EL20), with a FHIR client on the synthetic
// package and a fake CKM on the blood pressure fixture: every refusal per role and phase,
// anonymity of suggestions, the import and the coverage table.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectPhase } from "@/lib/project-phases";
import type {
  CkmArchetype,
  CkmArchetypeElements,
  CkmClient,
  CkmFailure,
  CkmResult,
} from "../ckm/client.ts";
import { parseArchetypeXml } from "../ckm/parse.ts";
import { ckmFixture } from "../ckm/test-fixtures.ts";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import type { FhirClient, FhirFailure, FhirResult } from "../fhir/client.ts";
import { type FhirStructure, parseStructureDefinition } from "../fhir/parse.ts";
import { fhirFixtureJson } from "../fhir/test-package.ts";
import { setPhase } from "../test-fixtures.ts";
import { personLeaks, projectWithMembers } from "../test-project-members.ts";
import {
  acceptSuggestion,
  addCkmSource,
  addFhirSource,
  addOtherSource,
  dataTypeForSource,
  dismissSuggestion,
  importSourceModel,
  listSourceModels,
  listSourceModelsWithAuthors,
  sourceCoverage,
  suggestSource,
} from "./queries.ts";
import { addFhirSourceInput, otherSourceInput } from "./schemas.ts";

const PACKAGE = "example.fhir.bp";
const VERSION = "1.0.0";
const PROFILE = "http://example.org/fhir/StructureDefinition/example-BloodPressure";
const MODEL = "http://example.org/fhir/StructureDefinition/BloodPressureModel";
const CID = "1013.1.3574";
const ARCHETYPE_ID = "openEHR-EHR-OBSERVATION.blood_pressure.v2";

function structure(file: string): FhirStructure {
  const parsed = parseStructureDefinition(fhirFixtureJson(`package/${file}`));
  if (!parsed.ok) throw new Error("fixture did not parse");
  return parsed.value;
}

/** A registry client on the synthetic package that fails with `failure` when set. */
class FakeFhir implements FhirClient {
  calls = 0;
  failure: FhirFailure | null = null;
  readonly structures = new Map<string, FhirStructure>([
    [PROFILE, structure("StructureDefinition-example-BloodPressure.json")],
    [MODEL, structure("StructureDefinition-BloodPressureModel.json")],
  ]);

  async searchPackages(): Promise<FhirResult<never[]>> {
    return { kind: "ok", value: [] };
  }

  async packageVersions(): Promise<FhirResult<never[]>> {
    return { kind: "ok", value: [] };
  }

  async structureDefinitions(): Promise<FhirResult<never[]>> {
    return { kind: "ok", value: [] };
  }

  async structureDefinition(name: string, version: string, url: string) {
    this.calls += 1;
    if (this.failure) return this.failure;
    if (name !== PACKAGE || version !== VERSION) return { kind: "not_found" } as const;
    const found = this.structures.get(url);
    return found ? ({ kind: "ok", value: found } as const) : ({ kind: "no_structure" } as const);
  }
}

class FakeCkm implements CkmClient {
  calls = 0;
  failure: CkmFailure | null = null;
  archetype: CkmArchetypeElements;

  constructor() {
    const parsed = parseArchetypeXml(ckmFixture("blood_pressure.v2.xml"));
    if (!parsed.ok) throw new Error(parsed.error);
    this.archetype = {
      cid: CID,
      archetypeId: ARCHETYPE_ID,
      name: "Blood pressure",
      status: "PUBLISHED",
      revision: "2.0.17",
      originalLanguage: parsed.value.originalLanguage,
      elements: parsed.value.elements,
    };
  }

  async searchArchetypes(): Promise<CkmResult<CkmArchetype[]>> {
    return { kind: "ok", value: [] };
  }

  async archetypeElements(): Promise<CkmResult<CkmArchetypeElements>> {
    this.calls += 1;
    if (this.failure) return this.failure;
    return { kind: "ok", value: this.archetype };
  }
}

let db: Kysely<DB>;
let fhir: FakeFhir;
let ckm: FakeCkm;

beforeEach(async () => {
  db = await createTestDb();
  fhir = new FakeFhir();
  ckm = new FakeCkm();
});

afterEach(async () => {
  await db.destroy();
});

function fhirInput(projectId: string, url = PROFILE) {
  return addFhirSourceInput.parse({ projectId, packageName: PACKAGE, version: VERSION, url });
}

function otherInput(projectId: string, title = "Ward observation form") {
  return otherSourceInput.parse({ projectId, title, link: "https://forms.example.test/bp" });
}

async function addProfile(projectId: string, userId: string, url = PROFILE): Promise<string> {
  const added = await addFhirSource(db, fhir, userId, fhirInput(projectId, url));
  if (!added.ok) throw new Error(`addFhirSource refused: ${added.error}`);
  return added.value.sourceModelId;
}

async function modelRows(projectId: string) {
  return db
    .selectFrom("source_model")
    .selectAll()
    .where("project_id", "=", projectId)
    .orderBy("created_at")
    .execute();
}

async function elementRows(projectId: string) {
  return db
    .selectFrom("element")
    .select(["id", "name", "description", "data_type", "min_occurs", "max_occurs"])
    .where("project_id", "=", projectId)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
}

describe("addFhirSource", () => {
  it("adds a zib profile with its elements, codes, bindings and NL-CM ids", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    const added = await addFhirSource(db, fhir, facilitator, fhirInput(projectId));
    expect(added).toEqual({
      ok: true,
      value: { sourceModelId: expect.any(String), kind: "zib", elementCount: 14 },
    });
    const [model] = await modelRows(projectId);
    expect(model).toMatchObject({
      kind: "zib",
      status: "added",
      title: "Example BloodPressure",
      fhir_package: PACKAGE,
      fhir_version: VERSION,
      fhir_canonical: PROFILE,
      fhir_kind: "resource",
      fhir_type: "Observation",
      zib_name: "BloodPressure",
      zib_version: "3.2.1(2020EN)",
      imported_at: null,
    });
    const elements = await db
      .selectFrom("source_element")
      .selectAll()
      .orderBy("position")
      .execute();
    expect(elements.map((e) => e.path)).toEqual(
      fhir.structures.get(PROFILE)?.elements.map((e) => e.id),
    );
    expect(elements.find((e) => e.path === "Observation.component:systolic")).toMatchObject({
      name: "SystolicBloodPressure",
      type: "BackboneElement",
      min_occurs: 1,
      max_occurs: 1,
      code_system: "http://loinc.org",
      code: "8480-6",
      code_display: "Systolic blood pressure",
    });
    expect(elements.find((e) => e.path === "Observation.effective[x]")).toMatchObject({
      type: "dateTime | Period",
    });
    expect(elements.find((e) => e.path === "Observation.status")).toMatchObject({
      binding_strength: "required",
      binding_value_set: "http://hl7.org/fhir/ValueSet/observation-status|4.0.1",
    });
    expect(elements.find((e) => e.path === "Observation.component")).toMatchObject({
      min_occurs: 2,
      max_occurs: null,
    });
    expect(
      elements.find((e) => e.path === "Observation.component:diastolic.value[x]")?.nl_cm_id,
    ).toBe("NL-CM:12.4.3");
  });

  it("adds a logical model without a zib as a fhir model, ahead of discover (PR10)", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "scope");
    const added = await addFhirSource(db, fhir, facilitator, fhirInput(projectId, MODEL));
    expect(added).toMatchObject({ ok: true, value: { kind: "fhir", elementCount: 5 } });
    const [model] = await modelRows(projectId);
    expect(model).toMatchObject({ fhir_kind: "logical", zib_name: null, zib_version: null });
  });

  it("refuses a participant and an outsider without calling the registry", async () => {
    const { projectId, participant, outsider } = await projectWithMembers(db, "discover");
    expect(await addFhirSource(db, fhir, participant, fhirInput(projectId))).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await addFhirSource(db, fhir, outsider, fhirInput(projectId))).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(fhir.calls).toBe(0);
  });

  it.each<ProjectPhase>(["decide", "handoff"])(
    "refuses the facilitator in %s, once discover is over",
    async (phase) => {
      const { projectId, facilitator } = await projectWithMembers(db, phase);
      expect(await addFhirSource(db, fhir, facilitator, fhirInput(projectId))).toEqual({
        ok: false,
        error: "source_after_discover",
      });
      expect(fhir.calls).toBe(0);
    },
  );

  it("refuses the same StructureDefinition twice", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    await addProfile(projectId, facilitator);
    expect(await addFhirSource(db, fhir, facilitator, fhirInput(projectId))).toEqual({
      ok: false,
      error: "source_already_added",
    });
    expect(await modelRows(projectId)).toHaveLength(1);
  });

  it("refuses an unknown package and an unknown StructureDefinition", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    const unknownPackage = addFhirSourceInput.parse({
      projectId,
      packageName: "example.no.such",
      version: VERSION,
      url: PROFILE,
    });
    expect(await addFhirSource(db, fhir, facilitator, unknownPackage)).toEqual({
      ok: false,
      error: "fhir_package_not_found",
    });
    expect(
      await addFhirSource(db, fhir, facilitator, fhirInput(projectId, "http://example.org/x")),
    ).toEqual({ ok: false, error: "fhir_structure_not_found" });
    expect(await modelRows(projectId)).toEqual([]);
  });

  it.each<[FhirFailure, { error: string; status?: number }]>([
    [{ kind: "unreachable" }, { error: "fhir_unreachable" }],
    [{ kind: "timeout" }, { error: "fhir_timeout" }],
    [
      { kind: "refused", status: 503 },
      { error: "fhir_refused", status: 503 },
    ],
    [{ kind: "too_large" }, { error: "fhir_too_large" }],
    [{ kind: "unusable" }, { error: "fhir_unusable" }],
    [{ kind: "not_r4" }, { error: "fhir_not_r4" }],
    [{ kind: "no_snapshot" }, { error: "fhir_no_snapshot" }],
  ])("maps the registry failure %o to a refusal", async (failure, expected) => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    fhir.failure = failure;
    expect(await addFhirSource(db, fhir, facilitator, fhirInput(projectId))).toEqual({
      ok: false,
      ...expected,
    });
  });

  it("refuses a StructureDefinition with no elements left", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    const empty = fhir.structures.get(MODEL);
    if (!empty) throw new Error("no model");
    fhir.structures.set(MODEL, { ...empty, elements: [] });
    expect(await addFhirSource(db, fhir, facilitator, fhirInput(projectId, MODEL))).toEqual({
      ok: false,
      error: "source_no_elements",
    });
  });
});

describe("addCkmSource", () => {
  it("adds the archetype's ELEMENT nodes with path, at-code and RM type", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    const added = await addCkmSource(db, ckm, facilitator, { projectId, cid: CID });
    expect(added).toMatchObject({
      ok: true,
      value: { kind: "ckm", elementCount: ckm.archetype.elements.length },
    });
    const [model] = await modelRows(projectId);
    expect(model).toMatchObject({
      kind: "ckm",
      title: "Blood pressure",
      ckm_archetype_id: ARCHETYPE_ID,
      ckm_cid: CID,
      ckm_revision: "2.0.17",
    });
    const systolic = await db
      .selectFrom("source_element")
      .selectAll()
      .where("at_code", "=", "at0004")
      .executeTakeFirstOrThrow();
    expect(systolic).toMatchObject({
      path: "/data[at0001]/events[at0006]/data[at0003]/items[at0004]",
      name: "Systolic",
      type: "DV_QUANTITY",
    });
  });

  it("refuses a participant, a late phase, a duplicate and a CKM failure", async () => {
    const { projectId, facilitator, participant } = await projectWithMembers(db, "discover");
    expect(await addCkmSource(db, ckm, participant, { projectId, cid: CID })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(ckm.calls).toBe(0);
    await addCkmSource(db, ckm, facilitator, { projectId, cid: CID });
    expect(await addCkmSource(db, ckm, facilitator, { projectId, cid: CID })).toEqual({
      ok: false,
      error: "source_already_added",
    });
    ckm.failure = { kind: "refused", status: 404 };
    expect(await addCkmSource(db, ckm, facilitator, { projectId, cid: CID })).toEqual({
      ok: false,
      error: "ckm_refused",
      status: 404,
    });
    ckm.failure = { kind: "timeout" };
    expect(await addCkmSource(db, ckm, facilitator, { projectId, cid: CID })).toEqual({
      ok: false,
      error: "ckm_timeout",
    });
    ckm.failure = null;
    await setPhase(db, projectId, "decide");
    expect(await addCkmSource(db, ckm, facilitator, { projectId, cid: CID })).toEqual({
      ok: false,
      error: "source_after_discover",
    });
  });

  it("refuses an archetype without elements", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    ckm.archetype = { ...ckm.archetype, elements: [] };
    expect(await addCkmSource(db, ckm, facilitator, { projectId, cid: CID })).toEqual({
      ok: false,
      error: "source_no_elements",
    });
  });
});

describe("addOtherSource", () => {
  it("adds a form by title and link, for the facilitator only", async () => {
    const { projectId, facilitator, participant } = await projectWithMembers(db, "discover");
    expect(await addOtherSource(db, participant, otherInput(projectId))).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await addOtherSource(db, facilitator, otherInput(projectId))).toMatchObject({
      ok: true,
      value: { kind: "other", elementCount: 0 },
    });
    expect(await modelRows(projectId)).toEqual([
      expect.objectContaining({
        kind: "other",
        status: "added",
        title: "Ward observation form",
        link: "https://forms.example.test/bp",
      }),
    ]);
  });

  it("refuses the facilitator after discover", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "handoff");
    expect(await addOtherSource(db, facilitator, otherInput(projectId))).toEqual({
      ok: false,
      error: "source_after_discover",
    });
  });

  it("validates the title and the link", () => {
    const projectId = "project-123";
    expect(otherSourceInput.safeParse({ projectId, title: " " }).success).toBe(false);
    expect(
      otherSourceInput.safeParse({ projectId, title: "Form", link: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(otherSourceInput.parse({ projectId, title: " Form " })).toEqual({
      projectId,
      title: "Form",
      link: null,
    });
  });
});

describe("suggestions", () => {
  it("lets a participant suggest a source in discover only", async () => {
    const { projectId, participant } = await projectWithMembers(db, "scope");
    expect(await suggestSource(db, participant, otherInput(projectId))).toEqual({
      ok: false,
      error: "phase_closed",
    });
    await setPhase(db, projectId, "discover");
    expect(await suggestSource(db, participant, otherInput(projectId))).toMatchObject({ ok: true });
    await setPhase(db, projectId, "decide");
    expect(await suggestSource(db, participant, otherInput(projectId))).toEqual({
      ok: false,
      error: "phase_closed",
    });
    expect((await modelRows(projectId)).map((row) => row.status)).toEqual(["suggested"]);
  });

  it("refuses an outsider", async () => {
    const { projectId, outsider } = await projectWithMembers(db, "discover");
    expect(await suggestSource(db, outsider, otherInput(projectId))).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("shows participants every source but never who suggested it (EL2)", async () => {
    const members = await projectWithMembers(db, "discover");
    const { projectId, facilitator, participant, otherParticipant } = members;
    await suggestSource(db, participant, otherInput(projectId, "Local triage form"));
    await addProfile(projectId, facilitator);
    const seen = await listSourceModels(db, otherParticipant, { projectId });
    if (!seen.ok) throw new Error(seen.error);
    expect(seen.value.map(({ title, status, mine }) => ({ title, status, mine }))).toEqual([
      { title: "Local triage form", status: "suggested", mine: false },
      { title: "Example BloodPressure", status: "added", mine: false },
    ]);
    expect(personLeaks(seen.value, members)).toEqual([]);
    const own = await listSourceModels(db, participant, { projectId });
    expect(own.ok && own.value[0]?.mine).toBe(true);
    expect(own.ok && personLeaks(own.value, members)).toEqual([]);
  });

  it("shows the facilitator who suggested each source, and nobody else", async () => {
    const { projectId, facilitator, participant } = await projectWithMembers(db, "discover");
    await suggestSource(db, participant, otherInput(projectId));
    const listed = await listSourceModelsWithAuthors(db, facilitator, { projectId });
    expect(listed).toMatchObject({
      ok: true,
      value: [{ addedBy: { email: "par@example.test" } }],
    });
    expect(await listSourceModelsWithAuthors(db, participant, { projectId })).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("lets the facilitator accept a suggestion as an other source", async () => {
    const { projectId, facilitator, participant } = await projectWithMembers(db, "discover");
    const suggested = await suggestSource(db, participant, otherInput(projectId));
    if (!suggested.ok) throw new Error(suggested.error);
    const input = { projectId, sourceModelId: suggested.value.sourceModelId };
    expect(await acceptSuggestion(db, participant, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await acceptSuggestion(db, facilitator, input)).toEqual({ ok: true, value: null });
    expect((await modelRows(projectId)).map((row) => row.status)).toEqual(["added"]);
    expect(await acceptSuggestion(db, facilitator, input)).toEqual({
      ok: false,
      error: "source_not_suggested",
    });
  });

  it("lets the facilitator dismiss a suggestion, and logs it", async () => {
    const { projectId, facilitator, participant } = await projectWithMembers(db, "discover");
    const suggested = await suggestSource(db, participant, otherInput(projectId));
    if (!suggested.ok) throw new Error(suggested.error);
    const input = { projectId, sourceModelId: suggested.value.sourceModelId };
    expect(await dismissSuggestion(db, participant, input)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await dismissSuggestion(db, facilitator, input)).toEqual({ ok: true, value: null });
    expect(await modelRows(projectId)).toEqual([]);
    const logged = await db
      .selectFrom("activity_log")
      .select("action")
      .where("target_id", "=", input.sourceModelId)
      .orderBy("id")
      .execute();
    expect(logged.map((row) => row.action)).toEqual([
      "source_model_added",
      "source_suggestion_dismissed",
    ]);
    expect(await dismissSuggestion(db, facilitator, input)).toEqual({
      ok: false,
      error: "source_not_found",
    });
  });

  it("refuses to accept or dismiss a model that is no suggestion, or after discover", async () => {
    const { projectId, facilitator, participant } = await projectWithMembers(db, "discover");
    const sourceModelId = await addProfile(projectId, facilitator);
    expect(await dismissSuggestion(db, facilitator, { projectId, sourceModelId })).toEqual({
      ok: false,
      error: "source_not_suggested",
    });
    const suggested = await suggestSource(db, participant, otherInput(projectId));
    if (!suggested.ok) throw new Error(suggested.error);
    await setPhase(db, projectId, "decide");
    expect(
      await acceptSuggestion(db, facilitator, {
        projectId,
        sourceModelId: suggested.value.sourceModelId,
      }),
    ).toEqual({ ok: false, error: "source_after_discover" });
  });

  it("does not find a suggestion of another project", async () => {
    const one = await projectWithMembers(db, "discover");
    const suggested = await suggestSource(db, one.participant, otherInput(one.projectId));
    if (!suggested.ok) throw new Error(suggested.error);
    const other = await addOtherSource(db, one.facilitator, otherInput(one.projectId));
    expect(other.ok).toBe(true);
    const { createProject } = await import("../projects/queries.ts");
    const second = await createProject(db, one.facilitator, { name: "Pulse" }, "en");
    if (!second.ok) throw new Error(second.error);
    expect(
      await acceptSuggestion(db, one.facilitator, {
        projectId: second.value.projectId,
        sourceModelId: suggested.value.sourceModelId,
      }),
    ).toEqual({ ok: false, error: "source_not_found" });
  });
});

describe("importSourceModel", () => {
  it("makes every source element a candidate with its source and link (EL7, EL11)", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    const sourceModelId = await addProfile(projectId, facilitator);
    const imported = await importSourceModel(db, facilitator, { projectId, sourceModelId });
    if (!imported.ok) throw new Error(imported.error);
    expect(imported.value.createdElementIds).toHaveLength(14);
    expect(imported.value.linkedElementIds).toEqual([]);
    const elements = await elementRows(projectId);
    expect(elements.map((e) => e.name)).toEqual(
      fhir.structures.get(PROFILE)?.elements.map((e) => e.name),
    );
    const value = elements.find((e) => e.description === "Diastolic blood pressure in mm[Hg].");
    expect(value).toMatchObject({
      description: "Diastolic blood pressure in mm[Hg].",
      data_type: "quantity",
      min_occurs: 0,
      max_occurs: 1,
    });
    // `Observation.component` is 2..*, outside the element cardinality of EL1.
    expect(elements.find((e) => e.name === "Component results")).toMatchObject({
      data_type: null,
      min_occurs: null,
      max_occurs: null,
    });
    const sources = await db
      .selectFrom("element_source")
      .select(["kind", "label"])
      .distinct()
      .execute();
    expect(sources).toEqual([{ kind: "zib", label: "Example BloodPressure" }]);
    const links = await db.selectFrom("element_source_link").selectAll().execute();
    expect(links).toHaveLength(14);
    const [model] = await modelRows(projectId);
    expect(model).toMatchObject({ status: "imported", imported_at: expect.any(Date) });
  });

  it("links a code-matched element to the candidate of an earlier import (EL20)", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    const profile = await addProfile(projectId, facilitator);
    const model = await addProfile(projectId, facilitator, MODEL);
    await importSourceModel(db, facilitator, { projectId, sourceModelId: profile });
    const systolic = await db
      .selectFrom("element")
      .select("id")
      .where("name", "=", "SystolicBloodPressure")
      .orderBy("created_at")
      .executeTakeFirstOrThrow();
    const imported = await importSourceModel(db, facilitator, { projectId, sourceModelId: model });
    if (!imported.ok) throw new Error(imported.error);
    // Systolic (LOINC 8480-6) joins the profile's candidate; the other four are new.
    expect(imported.value.linkedElementIds).toEqual([systolic.id]);
    expect(imported.value.createdElementIds).toHaveLength(4);
    const sources = await db
      .selectFrom("element_source")
      .select(["kind", "label"])
      .where("element_id", "=", systolic.id)
      .orderBy("created_at")
      .execute();
    expect(sources).toEqual([
      { kind: "zib", label: "Example BloodPressure" },
      { kind: "fhir", label: "Blood pressure model" },
    ]);
    const links = await db
      .selectFrom("element_source_link")
      .select("source_element_id")
      .where("element_id", "=", systolic.id)
      .execute();
    expect(links).toHaveLength(2);
  });

  it("imports a CKM model with a CKM link on each candidate, so the board shows it", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    const added = await addCkmSource(db, ckm, facilitator, { projectId, cid: CID });
    if (!added.ok) throw new Error(added.error);
    const imported = await importSourceModel(db, facilitator, {
      projectId,
      sourceModelId: added.value.sourceModelId,
    });
    if (!imported.ok) throw new Error(imported.error);
    const systolic = await db
      .selectFrom("element")
      .innerJoin("element_ckm_link", "element_ckm_link.element_id", "element.id")
      .innerJoin("element_source", "element_source.element_id", "element.id")
      .select([
        "element.data_type",
        "element_ckm_link.archetype_id",
        "element_ckm_link.revision",
        "element_ckm_link.rm_type",
        "element_source.kind",
        "element_source.label",
      ])
      .where("element_ckm_link.at_code", "=", "at0004")
      .executeTakeFirstOrThrow();
    expect(systolic).toEqual({
      data_type: "quantity",
      archetype_id: ARCHETYPE_ID,
      revision: "2.0.17",
      rm_type: "DV_QUANTITY",
      kind: "ckm",
      label: ARCHETYPE_ID,
    });
  });

  it("refuses a CKM model whose archetype the CKM import of EL7 already brought in", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    const added = await addCkmSource(db, ckm, facilitator, { projectId, cid: CID });
    if (!added.ok) throw new Error(added.error);
    const element = await db
      .insertInto("element")
      .values({ project_id: projectId, name: "Systolic" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("element_source")
      .values({ element_id: element.id, kind: "ckm", label: ARCHETYPE_ID })
      .execute();
    expect(
      await importSourceModel(db, facilitator, {
        projectId,
        sourceModelId: added.value.sourceModelId,
      }),
    ).toEqual({ ok: false, error: "source_already_imported" });
  });

  it("refuses a second import, a suggestion, an other source and an unknown model", async () => {
    const { projectId, facilitator, participant } = await projectWithMembers(db, "discover");
    const sourceModelId = await addProfile(projectId, facilitator);
    await importSourceModel(db, facilitator, { projectId, sourceModelId });
    const before = (await elementRows(projectId)).length;
    expect(await importSourceModel(db, facilitator, { projectId, sourceModelId })).toEqual({
      ok: false,
      error: "source_already_imported",
    });
    expect(await elementRows(projectId)).toHaveLength(before);

    const suggested = await suggestSource(db, participant, otherInput(projectId));
    if (!suggested.ok) throw new Error(suggested.error);
    expect(
      await importSourceModel(db, facilitator, {
        projectId,
        sourceModelId: suggested.value.sourceModelId,
      }),
    ).toEqual({ ok: false, error: "source_not_added" });

    const other = await addOtherSource(db, facilitator, otherInput(projectId, "Guideline"));
    if (!other.ok) throw new Error(other.error);
    expect(
      await importSourceModel(db, facilitator, {
        projectId,
        sourceModelId: other.value.sourceModelId,
      }),
    ).toEqual({ ok: false, error: "source_no_elements" });

    expect(
      await importSourceModel(db, facilitator, {
        projectId,
        sourceModelId: "0190a000-0000-7000-8000-000000000000",
      }),
    ).toEqual({ ok: false, error: "source_not_found" });
  });

  it("refuses a participant, an outsider and the facilitator after discover", async () => {
    const { projectId, facilitator, participant, outsider } = await projectWithMembers(
      db,
      "discover",
    );
    const sourceModelId = await addProfile(projectId, facilitator);
    expect(await importSourceModel(db, participant, { projectId, sourceModelId })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await importSourceModel(db, outsider, { projectId, sourceModelId })).toEqual({
      ok: false,
      error: "not_found",
    });
    await setPhase(db, projectId, "decide");
    expect(await importSourceModel(db, facilitator, { projectId, sourceModelId })).toEqual({
      ok: false,
      error: "source_after_discover",
    });
    expect(await elementRows(projectId)).toEqual([]);
  });

  it("lets the facilitator import ahead, in the scope phase (PR10)", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "scope");
    const sourceModelId = await addProfile(projectId, facilitator, MODEL);
    expect(await importSourceModel(db, facilitator, { projectId, sourceModelId })).toMatchObject({
      ok: true,
    });
  });
});

describe("sourceCoverage", () => {
  it("matches the added models into rows with one cell per model (EL20)", async () => {
    const { projectId, facilitator } = await projectWithMembers(db, "discover");
    const profile = await addProfile(projectId, facilitator);
    const model = await addProfile(projectId, facilitator, MODEL);
    await addOtherSource(db, facilitator, otherInput(projectId));
    const coverage = await sourceCoverage(db, facilitator, { projectId });
    if (!coverage.ok) throw new Error(coverage.error);
    expect(coverage.value.models.map((m) => m.id)).toEqual([profile, model]);
    const systolic = coverage.value.rows.find((row) => row.key === "http://loinc.org|8480-6");
    expect(systolic).toMatchObject({ basis: "code", applied: true });
    expect(systolic?.cells[profile]?.map((e) => e.path)).toEqual([
      "Observation.component:systolic",
    ]);
    expect(systolic?.cells[model]?.[0]).toMatchObject({
      path: "BloodPressureModel.systolic",
      type: "Quantity",
      min: 0,
      max: 1,
    });
    const diastolic = coverage.value.rows.find((row) => row.key === "NL-CM:12.4.3");
    expect(diastolic).toMatchObject({ basis: "mapping", applied: false });
    const names = coverage.value.rows
      .filter((row) => row.basis === "name")
      .map((row) => [row.cells[profile]?.[0]?.path, row.cells[model]?.[0]?.path]);
    expect(names).toEqual([
      ["Observation.note", "BloodPressureModel.text"],
      ["Observation.bodySite", "BloodPressureModel.measuringLocation"],
    ]);
    const total = coverage.value.rows.flatMap((row) => Object.values(row.cells).flat()).length;
    expect(total).toBe(14 + 5);
  });

  it("is the facilitator's only", async () => {
    const { projectId, participant, outsider } = await projectWithMembers(db, "discover");
    expect(await sourceCoverage(db, participant, { projectId })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await sourceCoverage(db, outsider, { projectId })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("dataTypeForSource", () => {
  it("maps one FHIR or RM type to the data type list and leaves a choice open", () => {
    expect(dataTypeForSource("fhir", "Quantity")).toBe("quantity");
    expect(dataTypeForSource("zib", "CodeableConcept")).toBe("coded_text");
    expect(dataTypeForSource("ckm", "DV_QUANTITY")).toBe("quantity");
    expect(dataTypeForSource("fhir", "dateTime | Period")).toBeNull();
    expect(dataTypeForSource("fhir", "BackboneElement")).toBeNull();
    expect(dataTypeForSource("ckm", null)).toBeNull();
  });
});
