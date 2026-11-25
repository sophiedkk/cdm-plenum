// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// How a project runs (PR14, ADR 0023): a Delphi study (anonymous, 1 to 9 scale) or a Team (named,
// rounds decide by consent). The database holds the same two values (migration 0028).
export const PROJECT_MODES = ["delphi", "team"] as const;
export type ProjectMode = (typeof PROJECT_MODES)[number];

export function isProjectMode(value: unknown): value is ProjectMode {
  return (PROJECT_MODES as readonly unknown[]).includes(value);
}
