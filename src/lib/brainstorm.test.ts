// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  ELEMENT_PROMPTS,
  foldName,
  isElementPrompt,
  nameSimilarity,
  SIMILAR_MAX,
  SIMILAR_THRESHOLD,
  similarElements,
} from "./brainstorm";

const named = (...names: string[]) => names.map((name) => ({ name }));

describe("ELEMENT_PROMPTS (EL14)", () => {
  it("follow the order of the page", () => {
    expect([...ELEMENT_PROMPTS]).toEqual(["recorded", "patient_state", "method", "context"]);
  });

  it("recognises a key and refuses anything else", () => {
    expect(isElementPrompt("method")).toBe(true);
    expect(isElementPrompt("protocol")).toBe(false);
    expect(isElementPrompt(null)).toBe(false);
  });
});

describe("foldName", () => {
  it("ignores case and accents", () => {
    expect(foldName("  Hémoglobine ")).toBe("hemoglobine");
    expect(foldName("Ödeem")).toBe("odeem");
  });
});

describe("nameSimilarity", () => {
  it("is 1 for the same name in another case or with accents", () => {
    expect(nameSimilarity("systolic PRESSURE", "Systolic pressure")).toBe(1);
    expect(nameSimilarity("hemoglobine", "Hémoglobine")).toBe(1);
  });

  it("matches the start of a word while the participant types", () => {
    expect(nameSimilarity("systol", "Systolic blood pressure")).toBe(1);
  });

  it("catches a small typing error", () => {
    expect(nameSimilarity("sytolic pressure", "Systolic pressure")).toBeGreaterThanOrEqual(
      SIMILAR_THRESHOLD,
    );
  });

  it("does not count stop words", () => {
    expect(nameSimilarity("position of the", "Name of the cuff")).toBeLessThan(SIMILAR_THRESHOLD);
  });

  it("is low for unrelated names", () => {
    expect(nameSimilarity("Heart rate", "Cuff size")).toBeLessThan(SIMILAR_THRESHOLD);
  });
});

describe("similarElements (EL15)", () => {
  it("lists nothing for fewer than 3 letters", () => {
    expect(similarElements("sy", named("Systolic"))).toEqual([]);
    expect(similarElements(" ", named("Systolic"))).toEqual([]);
  });

  it("lists similar names, the most similar first", () => {
    const found = similarElements(
      "diastolic pressure",
      named("Pressure", "Diastolic pressure", "Cuff size"),
    );
    expect(found.map((element) => element.name)).toEqual(["Diastolic pressure", "Pressure"]);
  });

  it("lists at most 5", () => {
    const many = named(...Array.from({ length: 8 }, (_, i) => `Blood pressure ${i}`));
    expect(similarElements("blood pressure", many)).toHaveLength(SIMILAR_MAX);
  });

  it("keeps the extra fields of the elements", () => {
    expect(similarElements("cuff", [{ id: "e1", name: "Cuff size" }])).toEqual([
      { id: "e1", name: "Cuff size" },
    ]);
  });
});
