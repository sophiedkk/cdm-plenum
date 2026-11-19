// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Translated names of the round values the screens show: status, outcome, expert type, change
// class and the rule problems. A table per value set, so a new value is a type error until it
// has a label.
import { m } from "@/i18n/messages";
import type { Outcome, RuleError } from "@/lib/consensus";
import type { ChangeClass, ExpertType } from "@/lib/panel";
import type { RoundStatus } from "@/server/rounds/round";

const STATUS_LABELS: Record<RoundStatus, () => string> = {
  draft: () => m.rounds_status_draft(),
  open: () => m.rounds_status_open(),
  awaiting_close: () => m.rounds_status_awaiting_close(),
  closed: () => m.rounds_status_closed(),
};

const OUTCOME_LABELS: Record<Outcome, () => string> = {
  included: () => m.rounds_outcome_included(),
  excluded: () => m.rounds_outcome_excluded(),
  no_consensus: () => m.rounds_outcome_no_consensus(),
};

const EXPERT_TYPE_LABELS: Record<ExpertType, () => string> = {
  clinical: () => m.rounds_expert_type_clinical(),
  terminology: () => m.rounds_expert_type_terminology(),
  architecture: () => m.rounds_expert_type_architecture(),
};

const CHANGE_CLASS_LABELS: Record<ChangeClass, () => string> = {
  A: () => m.rounds_change_class_a(),
  B: () => m.rounds_change_class_b(),
  C: () => m.rounds_change_class_c(),
  D: () => m.rounds_change_class_d(),
};

const CHANGE_CLASS_DESCRIPTIONS: Record<ChangeClass, () => string> = {
  A: () => m.rounds_change_class_a_description(),
  B: () => m.rounds_change_class_b_description(),
  C: () => m.rounds_change_class_c_description(),
  D: () => m.rounds_change_class_d_description(),
};

const RULE_ERROR_LABELS: Record<RuleError, () => string> = {
  scale_not_integer: () => m.rounds_rule_error_scale_not_integer(),
  scale_too_short: () => m.rounds_rule_error_scale_too_short(),
  bands_outside_scale: () => m.rounds_rule_error_bands_outside_scale(),
  bands_overlap: () => m.rounds_rule_error_bands_overlap(),
  agreement_not_above_half: () => m.rounds_rule_error_agreement_not_above_half(),
  opposition_not_below_agreement: () => m.rounds_rule_error_opposition_not_below_agreement(),
};

export function roundStatusLabel(status: RoundStatus): string {
  return STATUS_LABELS[status]();
}

export function outcomeLabel(outcome: Outcome): string {
  return OUTCOME_LABELS[outcome]();
}

export function expertTypeLabel(type: ExpertType): string {
  return EXPERT_TYPE_LABELS[type]();
}

/** The class letter with its name, such as "D, large change or new model". */
export function changeClassLabel(changeClass: ChangeClass): string {
  return CHANGE_CLASS_LABELS[changeClass]();
}

/** One line on when to pick the class. */
export function changeClassDescription(changeClass: ChangeClass): string {
  return CHANGE_CLASS_DESCRIPTIONS[changeClass]();
}

/** What is wrong with a consensus rule, from `ruleError` or a `rule_invalid` refusal. */
export function ruleErrorMessage(error: RuleError): string {
  return RULE_ERROR_LABELS[error]();
}
