// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  CODED_DATA_TYPE_KEYS,
  DATA_TYPES,
  dataTypeByKey,
  fhirTypeForRmType,
  isDataTypeKey,
} from "./data-types";

describe("DATA_TYPES", () => {
  it("holds the 17 types of the architecture list, each key and RM type once", () => {
    expect(DATA_TYPES).toHaveLength(17);
    expect(new Set(DATA_TYPES.map((type) => type.key)).size).toBe(17);
    expect(new Set(DATA_TYPES.map((type) => type.rmType)).size).toBe(17);
  });

  it("marks coded text, ordinal and scale as types with proposed values", () => {
    expect(CODED_DATA_TYPE_KEYS).toEqual(["coded_text", "ordinal", "scale"]);
  });
});

describe("isDataTypeKey", () => {
  it("accepts a listed key", () => {
    expect(isDataTypeKey("quantity")).toBe(true);
  });

  it("refuses an RM type name and an unknown key", () => {
    expect(isDataTypeKey("DV_QUANTITY")).toBe(false);
    expect(isDataTypeKey("not_a_type")).toBe(false);
  });
});

describe("dataTypeByKey", () => {
  it("returns the RM and FHIR type of a key", () => {
    expect(dataTypeByKey("date_time_interval")).toEqual({
      key: "date_time_interval",
      rmType: "DV_INTERVAL<DV_DATE_TIME>",
      fhirType: "Period",
    });
  });

  it("throws on a key outside the list", () => {
    expect(() => dataTypeByKey("nope" as never)).toThrow("unknown data type key: nope");
  });
});

describe("fhirTypeForRmType", () => {
  it("maps a listed RM type to its FHIR type", () => {
    expect(fhirTypeForRmType("DV_CODED_TEXT")).toBe("CodeableConcept");
  });

  it("returns null for an RM type outside the list", () => {
    expect(fhirTypeForRmType("DV_PARSABLE")).toBeNull();
  });
});
