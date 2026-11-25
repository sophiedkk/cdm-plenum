// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The first look at the elements from existing models (EL22, ADR 0020).

/** The answers to "Does this element belong to the concept?", in the order of the buttons. */
export const FIRST_LOOK_ANSWERS = ["not_belongs", "not_sure", "belongs"] as const;
export type FirstLookAnswer = (typeof FIRST_LOOK_ANSWERS)[number];

export function isFirstLookAnswer(value: unknown): value is FirstLookAnswer {
  return typeof value === "string" && (FIRST_LOOK_ANSWERS as readonly string[]).includes(value);
}

/** How many members gave each answer to one element (facilitator only). */
export type FirstLookCounts = Record<FirstLookAnswer, number>;
