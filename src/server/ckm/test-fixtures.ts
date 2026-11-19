// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Test helpers for the CKM client: the archetype XML fixtures in tests/fixtures/ckm/.
import { readFileSync } from "node:fs";

/** The text of `tests/fixtures/ckm/<name>`. */
export function ckmFixture(name: string): string {
  return readFileSync(new URL(`../../../tests/fixtures/ckm/${name}`, import.meta.url), "utf8");
}
