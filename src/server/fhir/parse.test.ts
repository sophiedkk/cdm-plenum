// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The StructureDefinition reader on the synthetic package: paths with slice names, cardinality,
// types, element codes, bindings, mappings, and what it leaves out.
import { describe, expect, it } from "vitest";
import { type FhirStructure, parseStructureDefinition, parseStructureSummary } from "./parse.ts";
import { fhirFixtureJson } from "./test-package.ts";

const PROFILE = "package/StructureDefinition-example-BloodPressure.json";
const MODEL = "package/StructureDefinition-BloodPressureModel.json";

function parsed(name: string): FhirStructure {
  const result = parseStructureDefinition(fhirFixtureJson(name));
  if (!result.ok) throw new Error("fixture did not parse");
  return result.value;
}

function element(structure: FhirStructure, id: string) {
  const found = structure.elements.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`no element ${id}`);
  return found;
}

describe("parseStructureSummary", () => {
  it("reads url, name, title, kind, type and the zib of a profile", () => {
    expect(parseStructureSummary(fhirFixtureJson(PROFILE))).toEqual({
      ok: true,
      value: {
        url: "http://example.org/fhir/StructureDefinition/example-BloodPressure",
        name: "ExampleBloodPressure",
        title: "Example BloodPressure",
        kind: "resource",
        type: "Observation",
        derivation: "constraint",
        version: "1.0.0",
        hasSnapshot: true,
        zib: { name: "BloodPressure", version: "3.2.1(2020EN)" },
      },
    });
  });

  it("reads a logical model without a zib", () => {
    const result = parseStructureSummary(fhirFixtureJson(MODEL));
    expect(result).toMatchObject({
      ok: true,
      value: { kind: "logical", derivation: "specialization", zib: null },
    });
  });

  it("refuses another resource type and a StructureDefinition without a url", () => {
    expect(
      parseStructureSummary(fhirFixtureJson("package/ValueSet-example-cuff-size.json")),
    ).toEqual({ ok: false, error: "unusable" });
    const { url: _url, ...withoutUrl } = fhirFixtureJson(PROFILE) as Record<string, unknown>;
    expect(parseStructureSummary(withoutUrl)).toEqual({ ok: false, error: "unusable" });
  });
});

describe("parseStructureDefinition: the profile", () => {
  const profile = parsed(PROFILE);

  it("keeps the clinical elements in snapshot order, with slice names in the id", () => {
    expect(profile.elements.map((e) => e.id)).toEqual([
      "Observation.status",
      "Observation.code",
      "Observation.effective[x]",
      "Observation.effective[x]:effectiveDateTime",
      "Observation.note",
      "Observation.note.text",
      "Observation.bodySite",
      "Observation.component",
      "Observation.component:systolic",
      "Observation.component:systolic.code",
      "Observation.component:systolic.value[x]",
      "Observation.component:diastolic",
      "Observation.component:diastolic.code",
      "Observation.component:diastolic.value[x]",
    ]);
  });

  it("leaves out the root, infrastructure and its children, prohibited elements and re-slices", () => {
    const ids = profile.elements.map((e) => e.id);
    for (const left of [
      "Observation",
      "Observation.id",
      "Observation.meta",
      "Observation.meta.versionId",
      "Observation.implicitRules",
      "Observation.language",
      "Observation.text",
      "Observation.contained",
      "Observation.extension",
      "Observation.extension:position",
      "Observation.modifierExtension",
      "Observation.note.id",
      "Observation.component.id",
      "Observation.component.modifierExtension",
      "Observation.focus",
      "Observation.focus.display",
      "Observation.component:systolic/arm",
      "Observation.component:systolic/arm.value[x]",
    ]) {
      expect(ids).not.toContain(left);
    }
  });

  it("keeps a deeper element named text, which is content (Annotation.text)", () => {
    expect(element(profile, "Observation.note.text")).toMatchObject({
      path: "Observation.note.text",
      types: ["markdown"],
    });
  });

  it("reads cardinality, with * as unbounded", () => {
    expect(element(profile, "Observation.status")).toMatchObject({ min: 1, max: 1 });
    expect(element(profile, "Observation.component")).toMatchObject({ min: 2, max: null });
    expect(element(profile, "Observation.component:systolic.value[x]")).toMatchObject({
      min: 0,
      max: 1,
    });
  });

  it("reads the path, slice name, name and definition", () => {
    expect(element(profile, "Observation.component:systolic.value[x]")).toMatchObject({
      path: "Observation.component.value[x]",
      sliceName: null,
      name: "SystolicBloodPressure",
      definition: "Systolic blood pressure in mm[Hg].",
    });
    expect(element(profile, "Observation.component:systolic")).toMatchObject({
      path: "Observation.component",
      sliceName: "systolic",
    });
  });

  it("reads every type code of a choice", () => {
    expect(element(profile, "Observation.effective[x]").types).toEqual(["dateTime", "Period"]);
  });

  it("reads ElementDefinition.code", () => {
    expect(element(profile, "Observation.component:systolic").codes).toEqual([
      { system: "http://loinc.org", code: "8480-6", display: "Systolic blood pressure" },
    ]);
  });

  it("takes the pattern on a .code child as the parent's code when it has none", () => {
    expect(element(profile, "Observation.component:diastolic").codes).toEqual([
      { system: "http://loinc.org", code: "8462-4", display: null },
    ]);
    expect(element(profile, "Observation.component:diastolic.code").codes).toEqual([]);
    expect(element(profile, "Observation.component:diastolic.value[x]").codes).toEqual([]);
  });

  it("reads the binding strength and value set", () => {
    expect(element(profile, "Observation.status").binding).toEqual({
      strength: "required",
      valueSet: "http://hl7.org/fhir/ValueSet/observation-status|4.0.1",
    });
    expect(element(profile, "Observation.bodySite").binding).toEqual({
      strength: "extensible",
      valueSet: "http://example.org/fhir/ValueSet/MeasuringLocationCodelist",
    });
    expect(element(profile, "Observation.component:systolic").binding).toBeNull();
  });

  it("reads the mappings and the NL-CM id among them", () => {
    expect(element(profile, "Observation.component:systolic.value[x]")).toMatchObject({
      mappings: [{ identity: "zib-bloodpressure-v3.2.1-2020EN", map: "NL-CM:12.4.2" }],
      nlCmId: "NL-CM:12.4.2",
    });
    expect(element(profile, "Observation.status").nlCmId).toBeNull();
  });
});

describe("parseStructureDefinition: the logical model", () => {
  const model = parsed(MODEL);

  it("keeps every element but the root and Element.extension, text included", () => {
    expect(model.elements.map((e) => e.id)).toEqual([
      "BloodPressureModel.systolic",
      "BloodPressureModel.diastolic",
      "BloodPressureModel.cuffSize",
      "BloodPressureModel.measuringLocation",
      "BloodPressureModel.text",
    ]);
  });

  it("reads the element code of the systolic pressure and the mapping of the diastolic", () => {
    expect(element(model, "BloodPressureModel.systolic").codes).toEqual([
      { system: "http://loinc.org", code: "8480-6", display: null },
    ]);
    expect(element(model, "BloodPressureModel.diastolic").nlCmId).toBe("NL-CM:12.4.3");
  });
});

describe("parseStructureDefinition: odd input", () => {
  const base = {
    resourceType: "StructureDefinition",
    url: "http://example.org/fhir/StructureDefinition/x",
    name: "X",
    kind: "resource",
    type: "Observation",
  };

  it("names an element by its last path part when it has no short", () => {
    const result = parseStructureDefinition({
      ...base,
      snapshot: { element: [{ path: "Observation" }, { path: "Observation.valueQuantity" }] },
    });
    expect(result).toMatchObject({
      ok: true,
      value: { elements: [{ id: "Observation.valueQuantity", name: "valueQuantity" }] },
    });
  });

  it("drops an unknown binding strength and a coding without a code", () => {
    const result = parseStructureDefinition({
      ...base,
      snapshot: {
        element: [
          {
            path: "Observation.code",
            binding: { strength: "mandatory" },
            code: [{ system: "http://loinc.org" }],
          },
        ],
      },
    });
    expect(result).toMatchObject({
      ok: true,
      value: { elements: [{ binding: null, codes: [] }] },
    });
  });

  it("reports a StructureDefinition without a snapshot", () => {
    expect(parseStructureDefinition(base)).toMatchObject({
      ok: true,
      value: { hasSnapshot: false, elements: [] },
    });
  });

  it("refuses an element without a path and a max that is no number", () => {
    expect(parseStructureDefinition({ ...base, snapshot: { element: [{ min: 0 }] } })).toEqual({
      ok: false,
      error: "unusable",
    });
    expect(
      parseStructureDefinition({
        ...base,
        snapshot: { element: [{ path: "Observation.code", max: "many" }] },
      }),
    ).toEqual({ ok: false, error: "unusable" });
  });
});
