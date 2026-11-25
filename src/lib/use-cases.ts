// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

/**
 * The use cases of a scope statement as a list. The statement keeps them in one text field:
 * one per line, or separated by semicolons when the text has no line break.
 * NOTE: no spec governs this, our own design; the split is for display only.
 */
export function splitUseCases(text: string): string[] {
  const parts = /\r?\n/.test(text) ? text.split(/\r?\n/) : text.split(/;\s+|;$/);
  return parts.map((part) => part.trim()).filter((part) => part !== "");
}
