// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Translated names of the values the screens show: project roles, phases, expert types and the
// brainstorm questions. A table per value set, so a new value is a type error until it has a label.
import { m } from "@/i18n/messages";
import type { ElementPrompt } from "@/lib/brainstorm";
import type { GroupLabel } from "@/lib/element-groups";
import type { ModelType } from "@/lib/model-types";
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
  detail: () => m.projects_phase_detail(),
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

const GROUP_NAMES: Record<ElementPrompt, () => string> = {
  recorded: () => m.board_group_recorded(),
  patient_state: () => m.board_group_patient_state(),
  method: () => m.board_group_method(),
  context: () => m.board_group_context(),
};

/**
 * The name of a group of elements (EL18): the facilitator's own, or the name of the question the
 * group started from, in the active locale.
 */
export function groupName(group: GroupLabel): string {
  if (group.name !== null) return group.name;
  return group.prompt === null ? "" : GROUP_NAMES[group.prompt]();
}

/** The brainstorm question in a word or two, for a table column; null for another source. */
export function promptLabel(prompt: ElementPrompt | null): string {
  return prompt === null ? m.board_prompt_short_none() : PROMPT_LABELS[prompt]();
}

const MODEL_TYPE_LABELS: Record<ModelType, () => string> = {
  observation: () => m.scope_model_type_observation(),
  evaluation: () => m.scope_model_type_evaluation(),
  instruction: () => m.scope_model_type_instruction(),
  action: () => m.scope_model_type_action(),
  cluster: () => m.scope_model_type_cluster(),
};

const MODEL_TYPE_DESCRIPTIONS: Record<ModelType, () => string> = {
  observation: () => m.scope_model_type_observation_description(),
  evaluation: () => m.scope_model_type_evaluation_description(),
  instruction: () => m.scope_model_type_instruction_description(),
  action: () => m.scope_model_type_action_description(),
  cluster: () => m.scope_model_type_cluster_description(),
};

/** The name of a model type (SC4) in the active locale. */
export function modelTypeLabel(type: ModelType): string {
  return MODEL_TYPE_LABELS[type]();
}

/** The one-line explanation of a model type (SC4) in the active locale. */
export function modelTypeDescription(type: ModelType): string {
  return MODEL_TYPE_DESCRIPTIONS[type]();
}
