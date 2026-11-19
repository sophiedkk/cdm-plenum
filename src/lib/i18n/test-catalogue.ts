// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Reads a message catalogue for tests that compare the catalogues with code. Node only.
import { readFileSync } from "node:fs";

/** The messages of `messages/<locale>.json`, without `$schema`. */
export function loadCatalogue(locale: string): Readonly<Record<string, string>> {
  const text = readFileSync(new URL(`../../../messages/${locale}.json`, import.meta.url), "utf8");
  const { $schema: _, ...messages } = JSON.parse(text) as Record<string, unknown>;
  for (const [key, value] of Object.entries(messages)) {
    if (typeof value !== "string") throw new Error(`${locale}.json: ${key} is not a string`);
  }
  return messages as Record<string, string>;
}
