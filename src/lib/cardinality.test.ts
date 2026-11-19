// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { cardinalityError, formatCardinality, parseCardinality } from "./cardinality";

describe("cardinalityError", () => {
  it("accepts 0..1, 1..1, 0..* and 1..5", () => {
    expect(cardinalityError(0, 1)).toBeNull();
    expect(cardinalityError(1, 1)).toBeNull();
    expect(cardinalityError(0, null)).toBeNull();
    expect(cardinalityError(1, 5)).toBeNull();
  });

  it("refuses a minimum other than 0 or 1", () => {
    expect(cardinalityError(2, 5)).toBe("min_not_0_or_1");
  });

  it("refuses a maximum of 0, a negative or a fraction", () => {
    expect(cardinalityError(0, 0)).toBe("max_not_positive_integer");
    expect(cardinalityError(0, -1)).toBe("max_not_positive_integer");
    expect(cardinalityError(0, 1.5)).toBe("max_not_positive_integer");
  });
});

describe("formatCardinality", () => {
  it("writes many as *", () => {
    expect(formatCardinality({ min: 1, max: null })).toBe("1..*");
    expect(formatCardinality({ min: 0, max: 1 })).toBe("0..1");
  });
});

describe("parseCardinality", () => {
  it("reads what formatCardinality writes", () => {
    expect(parseCardinality("0..*")).toEqual({ min: 0, max: null });
    expect(parseCardinality(" 1..3 ")).toEqual({ min: 1, max: 3 });
  });

  it("returns null for malformed or invalid text", () => {
    expect(parseCardinality("2..3")).toBeNull();
    expect(parseCardinality("0..0")).toBeNull();
    expect(parseCardinality("1-*")).toBeNull();
    expect(parseCardinality("")).toBeNull();
  });
});
