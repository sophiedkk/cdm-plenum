// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Translated names of the values the screens show: project roles, phases, expert types and the
// brainstorm questions. A table per value set, so a new value is a type error until it has a label.
import { m } from "@/i18n/messages";
import type { Locale } from "@/i18n/runtime";
import type { ElementPrompt } from "@/lib/brainstorm";
import type { GroupLabel } from "@/lib/element-groups";
import type { ModelType } from "@/lib/model-types";
import type { ProjectMode } from "@/lib/project-mode";
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

/** Reads a message in another locale than the active one, as the export does. */
export interface LocaleOption {
  locale: Locale;
}

interface SlotWording {
  question: (options?: LocaleOption) => string;
  short: (options?: LocaleOption) => string;
  group: (options?: LocaleOption) => string;
}

// NOTE: EL14, EL18, SC4; no spec governs this, our own design, approved by the owner on 2026-11-25.
// The four slots and their keys stay; only the wording, the short label and the group name depend
// on the model type. The split follows the openEHR guide "What reference model class to use when"
// (https://openehr.atlassian.net/wiki/spaces/healthmod/pages/2949139). No type reads as an
// observation. Nothing is stored per type, so a changed type moves no element.
const WORDING: Record<ModelType, Record<ElementPrompt, SlotWording>> = {
  observation: {
    recorded: {
      question: (options) => m.board_prompt_recorded({}, options),
      short: (options) => m.board_prompt_short_recorded({}, options),
      group: (options) => m.board_group_recorded({}, options),
    },
    patient_state: {
      question: (options) => m.board_prompt_patient_state({}, options),
      short: (options) => m.board_prompt_short_patient_state({}, options),
      group: (options) => m.board_group_patient_state({}, options),
    },
    method: {
      question: (options) => m.board_prompt_method({}, options),
      short: (options) => m.board_prompt_short_method({}, options),
      group: (options) => m.board_group_method({}, options),
    },
    context: {
      question: (options) => m.board_prompt_context({}, options),
      short: (options) => m.board_prompt_short_context({}, options),
      group: (options) => m.board_group_context({}, options),
    },
  },
  evaluation: {
    recorded: {
      question: (options) => m.board_prompt_evaluation_recorded({}, options),
      short: (options) => m.board_prompt_short_evaluation_recorded({}, options),
      group: (options) => m.board_group_evaluation_recorded({}, options),
    },
    patient_state: {
      question: (options) => m.board_prompt_evaluation_patient_state({}, options),
      short: (options) => m.board_prompt_short_evaluation_patient_state({}, options),
      group: (options) => m.board_group_evaluation_patient_state({}, options),
    },
    method: {
      question: (options) => m.board_prompt_evaluation_method({}, options),
      short: (options) => m.board_prompt_short_evaluation_method({}, options),
      group: (options) => m.board_group_evaluation_method({}, options),
    },
    context: {
      question: (options) => m.board_prompt_context({}, options),
      short: (options) => m.board_prompt_short_context({}, options),
      group: (options) => m.board_group_context({}, options),
    },
  },
  instruction: {
    recorded: {
      question: (options) => m.board_prompt_instruction_recorded({}, options),
      short: (options) => m.board_prompt_short_instruction_recorded({}, options),
      group: (options) => m.board_group_instruction_recorded({}, options),
    },
    patient_state: {
      question: (options) => m.board_prompt_instruction_patient_state({}, options),
      short: (options) => m.board_prompt_short_instruction_patient_state({}, options),
      group: (options) => m.board_group_instruction_patient_state({}, options),
    },
    method: {
      question: (options) => m.board_prompt_instruction_method({}, options),
      short: (options) => m.board_prompt_short_instruction_method({}, options),
      group: (options) => m.board_group_instruction_method({}, options),
    },
    context: {
      question: (options) => m.board_prompt_context({}, options),
      short: (options) => m.board_prompt_short_context({}, options),
      group: (options) => m.board_group_context({}, options),
    },
  },
  action: {
    recorded: {
      question: (options) => m.board_prompt_action_recorded({}, options),
      short: (options) => m.board_prompt_short_action_recorded({}, options),
      group: (options) => m.board_group_action_recorded({}, options),
    },
    patient_state: {
      question: (options) => m.board_prompt_action_patient_state({}, options),
      short: (options) => m.board_prompt_short_action_patient_state({}, options),
      group: (options) => m.board_group_action_patient_state({}, options),
    },
    method: {
      question: (options) => m.board_prompt_action_method({}, options),
      short: (options) => m.board_prompt_short_action_method({}, options),
      group: (options) => m.board_group_action_method({}, options),
    },
    context: {
      question: (options) => m.board_prompt_context({}, options),
      short: (options) => m.board_prompt_short_context({}, options),
      group: (options) => m.board_group_context({}, options),
    },
  },
  cluster: {
    recorded: {
      question: (options) => m.board_prompt_cluster_recorded({}, options),
      short: (options) => m.board_prompt_short_cluster_recorded({}, options),
      group: (options) => m.board_group_cluster_recorded({}, options),
    },
    patient_state: {
      question: (options) => m.board_prompt_cluster_patient_state({}, options),
      short: (options) => m.board_prompt_short_cluster_patient_state({}, options),
      group: (options) => m.board_group_cluster_patient_state({}, options),
    },
    method: {
      question: (options) => m.board_prompt_cluster_method({}, options),
      short: (options) => m.board_prompt_short_cluster_method({}, options),
      group: (options) => m.board_group_cluster_method({}, options),
    },
    context: {
      question: (options) => m.board_prompt_cluster_context({}, options),
      short: (options) => m.board_prompt_short_cluster_context({}, options),
      group: (options) => m.board_group_cluster_context({}, options),
    },
  },
};

function wording(prompt: ElementPrompt, type: ModelType | null): SlotWording {
  return WORDING[type ?? "observation"][prompt];
}

/** The brainstorm question (EL14) for a model type in the active locale. */
export function promptQuestion(
  prompt: ElementPrompt,
  type: ModelType | null,
  options?: LocaleOption,
): string {
  return wording(prompt, type).question(options);
}

/**
 * The name of a group of elements (EL18): the facilitator's own, or the name of the question the
 * group started from for the project's model type, in the active locale.
 */
export function groupName(
  group: GroupLabel,
  type: ModelType | null,
  options?: LocaleOption,
): string {
  if (group.name !== null) return group.name;
  return group.prompt === null ? "" : wording(group.prompt, type).group(options);
}

/** The brainstorm question in a word or two, for a table column; null for another source. */
export function promptLabel(
  prompt: ElementPrompt | null,
  type: ModelType | null,
  options?: LocaleOption,
): string {
  return prompt === null
    ? m.board_prompt_short_none({}, options)
    : wording(prompt, type).short(options);
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

const PROJECT_MODE_LABELS: Record<ProjectMode, () => string> = {
  delphi: () => m.projects_mode_delphi(),
  team: () => m.projects_mode_team(),
};

const PROJECT_MODE_DESCRIPTIONS: Record<ProjectMode, () => string> = {
  delphi: () => m.projects_mode_delphi_description(),
  team: () => m.projects_mode_team_description(),
};

/** The name of a project mode (PR14) in the active locale. */
export function projectModeLabel(mode: ProjectMode): string {
  return PROJECT_MODE_LABELS[mode]();
}

/** The one-line explanation of a project mode (PR14) in the active locale. */
export function projectModeDescription(mode: ProjectMode): string {
  return PROJECT_MODE_DESCRIPTIONS[mode]();
}
