// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The allowed units of a quantity (DT1, issue #71). A unit is a UCUM code the modeller types, as
// the UCUM specification writes them (<https://ucum.org/ucum>): case-sensitive ASCII with no
// spaces, such as `mm[Hg]`, `kPa`, `/min` or `%`.
import type { DataTypeKey } from "./data-types.ts";

/** The data types that carry units: a quantity, and an interval of quantities. */
export const UNIT_DATA_TYPE_KEYS: readonly DataTypeKey[] = ["quantity", "quantity_interval"];

/** The longest unit code and the most units one element lists. */
export const UNIT_MAX = 40;
export const UNITS_MAX = 10;

// NOTE: no spec governs this check, our own design. It tests the form of a UCUM code (printable
// ASCII, no spaces), not that the code is a valid UCUM expression; no lookup.
export const UNIT_PATTERN = /^[!-~]+$/;

export function isUnitCode(value: string): boolean {
  return value.length <= UNIT_MAX && UNIT_PATTERN.test(value);
}

/** Whether an element of this data type may carry units. */
export function takesUnits(dataType: string | null): boolean {
  return dataType !== null && (UNIT_DATA_TYPE_KEYS as readonly string[]).includes(dataType);
}

/** The units a person typed in one field: separated by spaces, empty entries dropped. */
export function parseUnits(text: string): string[] {
  return text.split(/\s+/).filter((unit) => unit !== "");
}

/** The units for a table cell or CSV column: joined with "; ", the first being preferred. */
export function joinUnits(units: readonly string[]): string {
  return units.join("; ");
}
