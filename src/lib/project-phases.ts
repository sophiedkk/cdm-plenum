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

/** Which way the facilitator moves the project: one phase on, or one phase back. */
export const PHASE_DIRECTIONS = ["next", "previous"] as const;
export type PhaseDirection = (typeof PHASE_DIRECTIONS)[number];

/** The phase one step from `phase` in `direction`, or null past either end. */
export function adjacentPhase(phase: ProjectPhase, direction: PhaseDirection): ProjectPhase | null {
  const index = PROJECT_PHASES.indexOf(phase) + (direction === "next" ? 1 : -1);
  return PROJECT_PHASES[index] ?? null;
}

/** Where a phase stands next to the current one, for the row of steps (PR4). */
export type PhaseStepState = "done" | "current" | "next" | "later";

/** Every phase in order with its state next to `current`. */
export function phaseSteps(
  current: ProjectPhase,
): { phase: ProjectPhase; state: PhaseStepState }[] {
  const at = PROJECT_PHASES.indexOf(current);
  return PROJECT_PHASES.map((phase, index) => {
    if (index < at) return { phase, state: "done" };
    if (index === at) return { phase, state: "current" };
    return { phase, state: index === at + 1 ? "next" : "later" };
  });
}

/** Whether `phase` is done while the project is in `current`: the project moved past it (PR13). */
export function phaseDone(current: ProjectPhase, phase: ProjectPhase): boolean {
  return PROJECT_PHASES.indexOf(phase) < PROJECT_PHASES.indexOf(current);
}
