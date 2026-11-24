// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The limits of a candidate element (EL1, EL6, EL9), shared by the forms, the CSV import and the
// server checks. No requirement sets them; they leave room for clinical wording without letting
// one element fill a screen.

export const ELEMENT_NAME_MAX = 200;
export const ELEMENT_DESCRIPTION_MAX = 4_000;
export const ELEMENT_SOURCE_LABEL_MAX = 300;
export const ELEMENT_COMMENT_MAX = 4_000;
export const ELEMENT_VALUE_TEXT_MAX = 200;
/** More values than this is a terminology subset, not a value list (EL9). */
export const ELEMENT_VALUES_MAX = 100;
/** How many elements one merge takes besides the one they merge into (EL5). */
export const MERGE_SOURCES_MAX = 50;

/** The kinds of an element (EL26): a data element, or a reference to another whole model. */
export const ELEMENT_KINDS = ["data", "reference"] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];
/** The longest title and link of the model a reference element names; migration 0020 agrees. */
export const REFERENCE_TITLE_MAX = 300;
export const REFERENCE_URL_MAX = 2_000;

/**
 * The model a reference element refers to (EL26): its title and an optional http or https link.
 * It names the whole model, never one of its elements (Architectuur zibs 2.0, P3.2).
 */
export interface ElementReference {
  title: string;
  url: string | null;
}

/** Whether `url` is a link a page may open: http or https only, so no script runs from it. */
export function isReferenceUrl(url: string): boolean {
  return /^https?:\/\/\S+$/.test(url);
}

/** The model a reference element names (EL26), or null for a data element. */
export function toReference(row: {
  kind: string;
  reference_title: string | null;
  reference_url: string | null;
}): ElementReference | null {
  if (row.kind !== "reference" || row.reference_title === null) return null;
  return { title: row.reference_title, url: row.reference_url };
}
