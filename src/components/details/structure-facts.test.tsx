// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facts of a structure and of codes in plain words (P4): the technical form sits in a folded
// "For modellers" part, open for modellers and closed for everyone else.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { DetailCodes, DetailStructure } from "@/lib/details";
import { CodeFacts } from "./code-facts";
import { StructureFacts } from "./structure-facts";

afterEach(cleanup);

const STRUCTURE: DetailStructure = {
  dataType: "quantity",
  cardinality: { min: 0, max: null },
  values: [],
  units: ["mm[Hg]"],
};

const CODES: DetailCodes = {
  code: { system: "http://loinc.org", code: "8480-6", display: null },
  bindingStrength: "required",
  valueSetUrl: null,
  valueCodes: [],
};

describe("StructureFacts", () => {
  it("names the data type and the cardinality in plain words", () => {
    render(<StructureFacts structure={STRUCTURE} />);
    expect(screen.getByText("Quantity")).toBeTruthy();
    expect(screen.getByText("Optional, any number")).toBeTruthy();
  });

  it("folds the RM and FHIR types and the min..max form, closed for a clinician", () => {
    const { container } = render(<StructureFacts structure={STRUCTURE} />);
    const folded = container.querySelector("details");
    expect(folded?.open).toBe(false);
    expect(folded?.textContent).toContain("DV_QUANTITY / Quantity");
    expect(folded?.textContent).toContain("0..*");
  });

  it("opens the technical part for a modeller", () => {
    const { container } = render(<StructureFacts structure={STRUCTURE} modeller />);
    expect(container.querySelector("details")?.open).toBe(true);
  });

  it("leaves the data type out for a reference element", () => {
    const { container } = render(<StructureFacts structure={STRUCTURE} reference />);
    expect(container.textContent).not.toContain("DV_QUANTITY");
    expect(container.textContent).toContain("0..*");
  });
});

describe("CodeFacts", () => {
  it("keeps the binding under the modellers part", () => {
    const { container } = render(<CodeFacts codes={CODES} values={[]} />);
    const folded = container.querySelector("details");
    expect(folded?.open).toBe(false);
    expect(folded?.textContent).toContain("Required");
    expect(container.textContent).toContain("8480-6");
  });

  it("opens the binding for a modeller", () => {
    const { container } = render(<CodeFacts codes={CODES} values={[]} modeller />);
    expect(container.querySelector("details")?.open).toBe(true);
  });
});
