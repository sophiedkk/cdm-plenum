// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Translated names of the values the screens show: project roles, phases, expert types and the
// brainstorm questions. A table per value set, so a new value is a type error until it has a label.
import { m } from "@/i18n/messages";
import type { ElementPrompt } from "@/lib/brainstorm";
import type { ProjectPhase } from "@/lib/project-phases";
import type { ExpertType, ProjectRole } from "@/lib/project-roles";

const ROLE_LABELS: Record<ProjectRole, () => string> = {
  facilitator: () => m.projects_role_facilitator(),
  participant: () => m.projects_role_participant(),
};

const PHASE_LABELS: Record<ProjectPhase, () => string> = {
  scope: () => m.projects_phase_scope(),
  discover: () => m.projects_phase_discover(),
  decide: () => m.projects_phase_decide(),
  handoff: () => m.projects_phase_handoff(),
};

/** The name of a project role in the active locale. */
export function projectRoleLabel(role: ProjectRole): string {
  return ROLE_LABELS[role]();
}

/** The name of a project phase in the active locale. */
export function projectPhaseLabel(phase: ProjectPhase): string {
  return PHASE_LABELS[phase]();
}

const EXPERT_TYPE_LABELS: Record<ExpertType, () => string> = {
  clinical: () => m.common_expert_type_clinical(),
  terminology: () => m.common_expert_type_terminology(),
  architecture: () => m.common_expert_type_architecture(),
};

/** The name of a stakeholder group's expert type (PR6) in the active locale. */
export function expertTypeLabel(expertType: ExpertType): string {
  return EXPERT_TYPE_LABELS[expertType]();
}

const PROMPT_QUESTIONS: Record<ElementPrompt, () => string> = {
  recorded: () => m.board_prompt_recorded(),
  patient_state: () => m.board_prompt_patient_state(),
  method: () => m.board_prompt_method(),
  context: () => m.board_prompt_context(),
};

/** The brainstorm question (EL14) in the active locale. */
export function promptQuestion(prompt: ElementPrompt): string {
  return PROMPT_QUESTIONS[prompt]();
}

const PROMPT_LABELS: Record<ElementPrompt, () => string> = {
  recorded: () => m.board_prompt_short_recorded(),
  patient_state: () => m.board_prompt_short_patient_state(),
  method: () => m.board_prompt_short_method(),
  context: () => m.board_prompt_short_context(),
};

/** The brainstorm question in a word or two, for a table column; null for another source. */
export function promptLabel(prompt: ElementPrompt | null): string {
  return prompt === null ? m.board_prompt_short_none() : PROMPT_LABELS[prompt]();
}
