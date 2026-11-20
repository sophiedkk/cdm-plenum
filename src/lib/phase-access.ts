// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Which project steps a participant sees and may write to in each phase (PR9), and what the
// facilitator may do ahead of the phase (PR10). The pages, the route guards and the server read
// this one table, so a new phase is one new row.
import { PROJECT_PHASES, type ProjectPhase } from "./project-phases.ts";
import type { ProjectRole } from "./project-roles.ts";

/**
 * The steps of a project, one per page. The export and the settings are the facilitator's, so
 * the table hides them from a participant in every phase (PR12).
 */
export const PROJECT_STEPS = [
  "scope",
  "brainstorm",
  "board",
  "rounds",
  "export",
  "members",
  "settings",
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
    scope: "comment",
    brainstorm: "hidden",
    board: "hidden",
    rounds: "hidden",
    export: "hidden",
    members: "read",
    settings: "hidden",
  },
  discover: {
    scope: "read",
    brainstorm: "add",
    board: "comment",
    rounds: "hidden",
    export: "hidden",
    members: "read",
    settings: "hidden",
  },
  decide: {
    scope: "read",
    brainstorm: "hidden",
    board: "read",
    rounds: "rate",
    export: "hidden",
    members: "read",
    settings: "hidden",
  },
  handoff: {
    scope: "read",
    brainstorm: "hidden",
    board: "read",
    rounds: "read",
    export: "hidden",
    members: "read",
    settings: "hidden",
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

// NOTE: EL21, owner decision 2026-11-20. Data type, cardinality and values show from the detail
// phase on. That phase is not built, so no project is in it and nothing shows them; the detail
// phase sets this constant to its own phase.
export const DETAIL_FIELDS_PHASE: ProjectPhase | null = null;

/**
 * Whether the UI shows data type, cardinality and values during `phase` (EL21): the board, an
 * element's details and edit form, the rating card's details and the detail flags of a round.
 * The database, the server and the export keep them in every phase.
 */
export function detailFieldsShown(phase: ProjectPhase): boolean {
  const from: ProjectPhase | null = DETAIL_FIELDS_PHASE;
  return from !== null && PROJECT_PHASES.indexOf(phase) >= PROJECT_PHASES.indexOf(from);
}

/** The phase from which the board shows each element's CKM link in a column of its own (EX2). */
export const CKM_COLUMN_PHASE: ProjectPhase = "decide";

/** Whether the board shows the CKM column during `phase`. */
export function ckmColumnShown(phase: ProjectPhase): boolean {
  return PROJECT_PHASES.indexOf(phase) >= PROJECT_PHASES.indexOf(CKM_COLUMN_PHASE);
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
