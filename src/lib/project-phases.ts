// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The phases a project moves through (PR4, docs/architecture.md, "The process the tool follows"),
// in order. The `project.phase` column holds one of these keys.

export const PROJECT_PHASES = ["scope", "discover", "decide", "handoff"] as const;
export type ProjectPhase = (typeof PROJECT_PHASES)[number];

/** Returns whether `value` names a project phase. */
export function isProjectPhase(value: unknown): value is ProjectPhase {
  return typeof value === "string" && (PROJECT_PHASES as readonly string[]).includes(value);
}
