// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import {
  cardinalityError,
  describeCardinality,
  formatCardinality,
  parseCardinality,
} from "./cardinality";

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

describe("describeCardinality (P4)", () => {
  afterEach(() => overwriteGetLocale(() => baseLocale));

  it("says it in words in English", () => {
    expect(describeCardinality({ min: 1, max: 1 })).toBe("Required, once");
    expect(describeCardinality({ min: 0, max: 1 })).toBe("Optional, once");
    expect(describeCardinality({ min: 1, max: null })).toBe("Required, one or more");
    expect(describeCardinality({ min: 0, max: null })).toBe("Optional, any number");
    expect(describeCardinality({ min: 0, max: 5 })).toBe("0 to 5 times");
    expect(describeCardinality({ min: 1, max: 3 })).toBe("1 to 3 times");
  });

  it("says it in words in Dutch", () => {
    overwriteGetLocale(() => "nl");
    expect(describeCardinality({ min: 1, max: 1 })).toBe("Verplicht, één keer");
    expect(describeCardinality({ min: 0, max: 1 })).toBe("Optioneel, één keer");
    expect(describeCardinality({ min: 1, max: null })).toBe("Verplicht, één of meer");
    expect(describeCardinality({ min: 0, max: null })).toBe("Optioneel, zo vaak als nodig");
    expect(describeCardinality({ min: 0, max: 5 })).toBe("0 tot 5 keer");
  });
});
