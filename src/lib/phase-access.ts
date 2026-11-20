// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Which project steps a participant sees and may write to in each phase (PR9), and what the
// facilitator may do ahead of the phase (PR10). The tabs, the route guards and the server read
// this one table, so a new phase is one new row.
import { PROJECT_PHASES, type ProjectPhase } from "./project-phases.ts";
import type { ProjectRole } from "./project-roles.ts";

/** The steps of a project, one per tab. The export is the facilitator's and outside the rule. */
export const PROJECT_STEPS = [
  "overview",
  "scope",
  "brainstorm",
  "board",
  "rounds",
  "members",
] as const;
export type ProjectStep = (typeof PROJECT_STEPS)[number];

/**
 * What a participant may do in a step: nothing (`hidden`), `read` it, or read it and write in
 * one way: `comment`, `add` elements or `rate` in an open round.
 */
export type StepAccess = "hidden" | "read" | "comment" | "add" | "rate";

// NOTE: PR9, owner decision 2026-11-20. The board in discover takes comments; adding elements
// there follows the brainstorm's `add`, so both forms open and close together.
export const PARTICIPANT_ACCESS = {
  scope: {
    overview: "read",
    scope: "comment",
    brainstorm: "hidden",
    board: "hidden",
    rounds: "hidden",
    members: "read",
  },
  discover: {
    overview: "read",
    scope: "read",
    brainstorm: "add",
    board: "comment",
    rounds: "hidden",
    members: "read",
  },
  decide: {
    overview: "read",
    scope: "read",
    brainstorm: "hidden",
    board: "read",
    rounds: "rate",
    members: "read",
  },
  handoff: {
    overview: "read",
    scope: "read",
    brainstorm: "hidden",
    board: "read",
    rounds: "read",
    members: "read",
  },
} as const satisfies Record<ProjectPhase, Record<ProjectStep, StepAccess>>;

/** The participant writes the phase table opens or closes, each with its step and access. */
export const PARTICIPANT_WRITES = {
  scope_comment: { step: "scope", access: "comment" },
  element_add: { step: "brainstorm", access: "add" },
  element_comment: { step: "board", access: "comment" },
  // NOTE: EL16. "I support this" and "same as" are light marks on the board, open with comments.
  element_mark: { step: "board", access: "comment" },
  rate: { step: "rounds", access: "rate" },
  // NOTE: EL12, owner decision 2026-11-20. A participant suggests a source model while the
  // brainstorm takes elements; only the facilitator adds and imports one.
  source_suggest: { step: "brainstorm", access: "add" },
} as const satisfies Record<string, { step: ProjectStep; access: StepAccess }>;
export type ParticipantWrite = keyof typeof PARTICIPANT_WRITES;

/** What a participant may do in `step` during `phase`. */
export function participantAccess(phase: ProjectPhase, step: ProjectStep): StepAccess {
  return PARTICIPANT_ACCESS[phase][step];
}

/**
 * Whether the member sees `step` during `phase`: the facilitator every step at any time (PR10),
 * a participant the steps the table does not hide (PR9). A facilitator who joined a stakeholder
 * group to rate stays a facilitator here.
 */
export function stepVisible(role: ProjectRole, phase: ProjectPhase, step: ProjectStep): boolean {
  return role === "facilitator" || participantAccess(phase, step) !== "hidden";
}

/**
 * Whether the member may make `write` during `phase`. The facilitator prepares ahead, so the
 * phase never closes a write for them; their own phase rules sit with each action (PR10).
 */
export function writeOpen(
  role: ProjectRole,
  phase: ProjectPhase,
  write: ParticipantWrite,
): boolean {
  if (role === "facilitator") return true;
  const { step, access } = PARTICIPANT_WRITES[write];
  return participantAccess(phase, step) === access;
}

/** The phase in which the facilitator opens a round and keeps it open (PR10). */
export const ROUND_PHASE: ProjectPhase = "decide";

/** The phase in which every member, the facilitator too, marks elements after the reveal (EL16). */
export const MARK_PHASE: ProjectPhase = "discover";

/** The phase in which the facilitator reveals the board by hand (PR10, EL13). */
export const REVEAL_PHASE: ProjectPhase = "discover";

/** The phase the source models seed: discover starts from existing models (EL12, ADR 0016). */
export const SOURCE_PHASE: ProjectPhase = "discover";

/**
 * Whether the facilitator may still prepare for `target` during `phase`: before it, ahead of
 * the participants (PR10), or in it; not once the project has moved past it.
 */
export function preparesAhead(phase: ProjectPhase, target: ProjectPhase): boolean {
  return PROJECT_PHASES.indexOf(phase) <= PROJECT_PHASES.indexOf(target);
}
