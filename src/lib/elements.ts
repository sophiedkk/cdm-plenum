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
