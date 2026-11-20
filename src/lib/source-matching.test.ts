// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The coverage matching of EL20: codes first, then NL-CM mappings, then similar names, on
// invented blood pressure elements.
import { describe, expect, it } from "vitest";
import {
  elementNameSimilarity,
  type MatchableElement,
  type MatchableModel,
  matchSourceElements,
} from "./source-matching.ts";

const LOINC = "http://loinc.org";

function el(id: string, name: string, extra: Partial<MatchableElement> = {}): MatchableElement {
  return { id, name, codeSystem: null, code: null, nlCmId: null, ...extra };
}

function model(id: string, elements: MatchableElement[]): MatchableModel {
  return { id, elements };
}

/** Each row as `basis: model=ids; ...`, for short assertions. */
function summary(models: MatchableModel[]): string[] {
  return matchSourceElements(models).map((row) => {
    const cells = Object.entries(row.cells)
      .map(([modelId, elements]) => `${modelId}=${elements.map((e) => e.id).join(",")}`)
      .join(" ");
    return `${row.basis}${row.applied ? "!" : ""}: ${cells}`;
  });
}

describe("matchSourceElements", () => {
  it("applies a match on the same element code across models", () => {
    const rows = matchSourceElements([
      model("profile", [el("p1", "SystolicBloodPressure", { codeSystem: LOINC, code: "8480-6" })]),
      model("archetype", [el("a1", "Upper pressure", { codeSystem: LOINC, code: "8480-6" })]),
    ]);
    expect(rows).toEqual([
      {
        basis: "code",
        applied: true,
        key: "http://loinc.org|8480-6",
        cells: {
          profile: [expect.objectContaining({ id: "p1" })],
          archetype: [expect.objectContaining({ id: "a1" })],
        },
      },
    ]);
  });

  it("needs the system as well as the code", () => {
    expect(
      summary([
        model("a", [el("a1", "Alpha", { codeSystem: LOINC, code: "123" })]),
        model("b", [el("b1", "Beta", { codeSystem: "http://snomed.info/sct", code: "123" })]),
      ]),
    ).toEqual(["none: a=a1", "none: b=b1"]);
  });

  it("suggests a match on the same NL-CM id, without applying it", () => {
    const rows = matchSourceElements([
      model("profile", [el("p1", "DiastolicBloodPressure", { nlCmId: "NL-CM:12.4.3" })]),
      model("logical", [el("l1", "Lower", { nlCmId: "NL-CM:12.4.3" })]),
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ basis: "mapping", applied: false, key: "NL-CM:12.4.3" });
  });

  it("takes a code match before a mapping match", () => {
    expect(
      summary([
        model("a", [el("a1", "One", { codeSystem: LOINC, code: "8480-6", nlCmId: "NL-CM:1.1" })]),
        model("b", [el("b1", "Two", { codeSystem: LOINC, code: "8480-6" })]),
        model("c", [el("c1", "Three", { nlCmId: "NL-CM:1.1" })]),
      ]),
    ).toEqual(["code!: a=a1 b=b1", "none: c=c1"]);
  });

  it("suggests a match on a similar name, camel case included", () => {
    expect(
      summary([
        model("profile", [el("p1", "MeasuringLocation")]),
        model("logical", [el("l1", "Measuring location")]),
      ]),
    ).toEqual(["name: profile=p1 logical=l1"]);
  });

  it("puts at most one element per model in a name row, the most alike first", () => {
    expect(
      summary([
        model("a", [el("a1", "Cuff size"), el("a2", "Cuff size used")]),
        model("b", [el("b1", "Cuff size")]),
      ]),
    ).toEqual(["name: a=a1 b=b1", "none: a=a2"]);
  });

  it("joins a name row over three models", () => {
    expect(
      summary([
        model("a", [el("a1", "Systolic")]),
        model("b", [el("b1", "systolic")]),
        model("c", [el("c1", "Systolic ")]),
      ]),
    ).toEqual(["name: a=a1 b=b1 c=c1"]);
  });

  it("leaves unlike elements unmatched, each in a row of its own", () => {
    expect(
      summary([model("a", [el("a1", "Blood pressure")]), model("b", [el("b1", "Blood glucose")])]),
    ).toEqual(["none: a=a1", "none: b=b1"]);
  });

  it("matches nothing within one model", () => {
    expect(
      summary([
        model("only", [
          el("o1", "Systolic", { codeSystem: LOINC, code: "8480-6" }),
          el("o2", "Systolic", { codeSystem: LOINC, code: "8480-6", nlCmId: "NL-CM:1" }),
          el("o3", "Other", { nlCmId: "NL-CM:1" }),
        ]),
      ]),
    ).toEqual(["none: only=o1", "none: only=o2", "none: only=o3"]);
  });

  it("keeps two elements of one model in a code row when both carry the code", () => {
    expect(
      summary([
        model("a", [
          el("a1", "Systolic", { codeSystem: LOINC, code: "8480-6" }),
          el("a2", "Systolic value", { codeSystem: LOINC, code: "8480-6" }),
        ]),
        model("b", [el("b1", "Upper", { codeSystem: LOINC, code: "8480-6" })]),
      ]),
    ).toEqual(["code!: a=a1,a2 b=b1"]);
  });

  it("orders the rows by their first element", () => {
    expect(
      summary([
        model("a", [el("a1", "Alpha"), el("a2", "Cuff size"), el("a3", "Zeta", { nlCmId: "X" })]),
        model("b", [el("b1", "Zeta", { nlCmId: "X" }), el("b2", "Cuff size")]),
      ]),
    ).toEqual(["none: a=a1", "name: a=a2 b=b2", "mapping: a=a3 b=b1"]);
  });

  it("returns no rows for no models and for models without elements", () => {
    expect(matchSourceElements([])).toEqual([]);
    expect(matchSourceElements([model("a", []), model("b", [])])).toEqual([]);
  });

  it("matches the fixture profile and logical model as the coverage table would", () => {
    expect(
      summary([
        model("profile", [
          el("status", "registered | preliminary | final | amended +"),
          el("systolic", "SystolicBloodPressure", { codeSystem: LOINC, code: "8480-6" }),
          el("systolic.value", "SystolicBloodPressure", { nlCmId: "NL-CM:12.4.2" }),
          el("diastolic.value", "DiastolicBloodPressure", { nlCmId: "NL-CM:12.4.3" }),
          el("bodySite", "MeasuringLocation", { nlCmId: "NL-CM:12.4.10" }),
        ]),
        model("logical", [
          el("systolic", "Systolic", { codeSystem: LOINC, code: "8480-6" }),
          el("diastolic", "Diastolic", { nlCmId: "NL-CM:12.4.3" }),
          el("cuffSize", "Cuff size"),
          el("measuringLocation", "Measuring location"),
        ]),
      ]),
    ).toEqual([
      "none: profile=status",
      "code!: profile=systolic logical=systolic",
      "none: profile=systolic.value",
      "mapping: profile=diastolic.value logical=diastolic",
      "name: profile=bodySite logical=measuringLocation",
      "none: logical=cuffSize",
    ]);
  });
});

describe("elementNameSimilarity", () => {
  it("is the same both ways and 1 for the same words", () => {
    expect(elementNameSimilarity("Systolic", "Systolic blood pressure")).toBe(
      elementNameSimilarity("Systolic blood pressure", "Systolic"),
    );
    expect(elementNameSimilarity("cuffSize", "Cuff size")).toBe(1);
  });
});
