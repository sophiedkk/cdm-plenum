// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Element cardinality (EL1): a minimum of 0 or 1 and a maximum of a positive number or many
// (null). openEHR occurrences and FHIR element cardinality share the `min..max` form.

import { m } from "@/i18n/messages";

export interface Cardinality {
  min: 0 | 1;
  max: number | null;
}

export type CardinalityError = "min_not_0_or_1" | "max_not_positive_integer" | "max_below_min";

/** Checks a cardinality; returns the first problem, or null when it is valid. */
export function cardinalityError(min: number, max: number | null): CardinalityError | null {
  if (min !== 0 && min !== 1) return "min_not_0_or_1";
  if (max === null) return null;
  if (!Number.isInteger(max) || max < 1) return "max_not_positive_integer";
  if (max < min) return "max_below_min";
  return null;
}

/** Writes a cardinality as `0..1` or `1..*`. */
export function formatCardinality({ min, max }: Cardinality): string {
  return `${min}..${max === null ? "*" : max}`;
}

/** Reads `0..1`, `1..*` or `0..5`; returns null for anything else. */
export function parseCardinality(text: string): Cardinality | null {
  const match = /^([01])\.\.(\*|[1-9][0-9]*)$/.exec(text.trim());
  if (!match) return null;
  const min = match[1] === "1" ? 1 : 0;
  const max = match[2] === "*" || match[2] === undefined ? null : Number(match[2]);
  return cardinalityError(min, max) === null ? { min, max } : null;
}

/**
 * Writes a cardinality in words for readers who are no modellers, such as "Required, once" (P4,
 * owner decision 2026-11-25). The words come from the active locale.
 */
export function describeCardinality({ min, max }: Cardinality): string {
  if (max === 1) return min === 1 ? m.details_card_required_once() : m.details_card_optional_once();
  if (max === null) {
    return min === 1 ? m.details_card_required_many() : m.details_card_optional_many();
  }
  return m.details_card_range({ min, max });
}
