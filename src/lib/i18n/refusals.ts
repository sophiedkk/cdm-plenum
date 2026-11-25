// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The one map from a refusal code the server returns to the message the screen shows (ADR 0007).
// The codes are imported as types only, so no server module reaches the browser bundle;
// refusals.test.ts checks the map against the server's code lists and both catalogues.
import { m } from "@/i18n/messages";
import type { SignInError } from "@/lib/sign-in";
import type { AdminActionError } from "@/server/admin/queries";
import type { CkmActionError } from "@/server/ckm/queries";
import type { DevSignInError } from "@/server/dev-sign-in/queries";
import type { ProjectActionError } from "@/server/projects/access";
import type { RoundActionError } from "@/server/rounds/access";
import type { SourceActionError } from "@/server/sources/queries";

/** A refused session (`AuthError` of src/server/middleware.ts) and the sign-in link errors. */
export const AUTH_REFUSALS = [
  "unauthenticated",
  "not_invited",
  "invalid_link",
] as const satisfies readonly ("unauthenticated" | SignInError)[];
export type AuthRefusal = (typeof AUTH_REFUSALS)[number];

/** Every refusal code a server function returns today. */
export type RefusalCode =
  | ProjectActionError
  | RoundActionError
  | CkmActionError
  | SourceActionError
  | AdminActionError
  | DevSignInError
  | AuthRefusal;

/** The message key of each refusal code; `satisfies` makes a missing code a type error. */
export const REFUSAL_MESSAGE_KEYS = {
  not_found: "common_refusal_not_found",
  forbidden: "common_refusal_forbidden",
  group_not_found: "common_refusal_group_not_found",
  group_name_taken: "common_refusal_group_name_taken",
  group_not_empty: "common_refusal_group_not_empty",
  already_member: "common_refusal_already_member",
  already_invited: "common_refusal_already_invited",
  invitation_not_found: "common_refusal_invitation_not_found",
  scope_source_not_found: "common_refusal_scope_source_not_found",
  scope_source_order_mismatch: "common_refusal_scope_source_order_mismatch",
  element_not_found: "common_refusal_element_not_found",
  element_in_round: "common_refusal_element_in_round",
  element_has_values: "common_refusal_element_has_values",
  values_not_allowed: "common_refusal_values_not_allowed",
  units_not_allowed: "common_refusal_units_not_allowed",
  value_number_required: "common_refusal_value_number_required",
  value_number_not_allowed: "common_refusal_value_number_not_allowed",
  value_number_not_integer: "common_refusal_value_number_not_integer",
  merge_values_conflict: "common_refusal_merge_values_conflict",
  round_not_found: "common_refusal_round_not_found",
  element_not_in_round: "common_refusal_element_not_in_round",
  panel_locked: "common_refusal_panel_locked",
  previous_round_not_closed: "common_refusal_previous_round_not_closed",
  round_not_draft: "common_refusal_round_not_draft",
  round_not_open: "common_refusal_round_not_open",
  round_not_due: "common_refusal_round_not_due",
  round_not_closed: "common_refusal_round_not_closed",
  round_has_no_elements: "common_refusal_round_has_no_elements",
  closes_at_past: "common_refusal_closes_at_past",
  score_out_of_scale: "common_refusal_score_out_of_scale",
  raters_hidden: "common_refusal_raters_hidden",
  rule_invalid: "common_refusal_rule_invalid",
  reason_required: "common_refusal_reason_required",
  rater_group_required: "common_refusal_rater_group_required",
  rater_group_locked: "common_refusal_rater_group_locked",
  mode_locked: "common_refusal_mode_locked",
  board_already_revealed: "common_refusal_board_already_revealed",
  merge_before_reveal: "common_refusal_merge_before_reveal",
  phase_changed: "common_refusal_phase_changed",
  no_next_phase: "common_refusal_no_next_phase",
  no_previous_phase: "common_refusal_no_previous_phase",
  phase_closed: "common_refusal_phase_closed",
  reveal_outside_discover: "common_refusal_reveal_outside_discover",
  round_still_open: "common_refusal_round_still_open",
  marks_before_reveal: "common_refusal_marks_before_reveal",
  mail_not_configured: "common_refusal_mail_not_configured",
  reminder_outside_discover: "common_refusal_reminder_outside_discover",
  same_as_itself: "common_refusal_same_as_itself",
  element_group_not_found: "common_refusal_element_group_not_found",
  groups_after_discover: "common_refusal_groups_after_discover",
  group_check_before_reveal: "common_refusal_group_check_before_reveal",
  group_check_not_asked: "common_refusal_group_check_not_asked",
  recap_not_ready: "common_refusal_recap_not_ready",
  private_after_group_check: "common_refusal_private_after_group_check",
  detail_not_in_model: "common_refusal_detail_not_in_model",
  detail_not_architect: "common_refusal_detail_not_architect",
  detail_version_changed: "common_refusal_detail_version_changed",
  detail_proposal_not_found: "common_refusal_detail_proposal_not_found",
  detail_settled: "common_refusal_detail_settled",
  detail_answer_not_found: "common_refusal_detail_answer_not_found",
  detail_objections_open: "common_refusal_detail_objections_open",
  detail_structure_open: "common_refusal_detail_structure_open",
  detail_not_terminologist: "common_refusal_detail_not_terminologist",
  detail_value_codes_mismatch: "common_refusal_detail_value_codes_mismatch",
  detail_not_reviewed: "common_refusal_detail_not_reviewed",
  detail_review_own: "common_refusal_detail_review_own",
  detail_review_not_pending: "common_refusal_detail_review_not_pending",
  detail_review_possible: "common_refusal_detail_review_possible",
  reference_data_type: "common_refusal_reference_data_type",
  element_kind_locked: "common_refusal_element_kind_locked",
  merge_kind_conflict: "common_refusal_merge_kind_conflict",
  detail_reference_structure: "common_refusal_detail_reference_structure",
  detail_reference_codes: "common_refusal_detail_reference_codes",
  model_type_after_discover: "common_refusal_model_type_after_discover",
  tree_group_not_found: "common_refusal_tree_group_not_found",
  tree_group_name_required: "common_refusal_tree_group_name_required",
  tree_cycle: "common_refusal_tree_cycle",
  round_outside_decide: "common_refusal_round_outside_decide",
  round_outside_detail: "common_refusal_round_outside_detail",
  value_not_in_round: "common_refusal_value_not_in_round",
  value_round_items: "common_refusal_value_round_items",
  value_list_not_found: "common_refusal_value_list_not_found",
  value_list_empty: "common_refusal_value_list_empty",
  value_list_settled: "common_refusal_value_list_settled",
  value_list_in_round: "common_refusal_value_list_in_round",
  value_list_changed: "common_refusal_value_list_changed",
  value_list_applied: "common_refusal_value_list_applied",
  value_list_unchanged: "common_refusal_value_list_unchanged",
  detail_in_value_round: "common_refusal_detail_in_value_round",
  minimum_reason_required: "common_refusal_minimum_reason_required",
  proposals_first_round_only: "common_refusal_proposals_first_round_only",
  proposal_not_found: "common_refusal_proposal_not_found",
  proposal_already_on_board: "common_refusal_proposal_already_on_board",
  ckm_unreachable: "common_refusal_ckm_unreachable",
  ckm_timeout: "common_refusal_ckm_timeout",
  ckm_refused: "common_refusal_ckm_refused",
  ckm_unusable: "common_refusal_ckm_unusable",
  ckm_revision_changed: "common_refusal_ckm_revision_changed",
  ckm_element_not_found: "common_refusal_ckm_element_not_found",
  ckm_reference: "common_refusal_ckm_reference",
  fhir_unreachable: "common_refusal_fhir_unreachable",
  fhir_timeout: "common_refusal_fhir_timeout",
  fhir_refused: "common_refusal_fhir_refused",
  fhir_unusable: "common_refusal_fhir_unusable",
  fhir_too_large: "common_refusal_fhir_too_large",
  fhir_not_r4: "common_refusal_fhir_not_r4",
  fhir_package_not_found: "common_refusal_fhir_package_not_found",
  fhir_structure_not_found: "common_refusal_fhir_structure_not_found",
  fhir_no_snapshot: "common_refusal_fhir_no_snapshot",
  source_not_found: "common_refusal_source_not_found",
  source_already_added: "common_refusal_source_already_added",
  source_already_imported: "common_refusal_source_already_imported",
  source_not_added: "common_refusal_source_not_added",
  source_not_suggested: "common_refusal_source_not_suggested",
  source_no_elements: "common_refusal_source_no_elements",
  source_after_discover: "common_refusal_source_after_discover",
  source_row_not_found: "common_refusal_source_row_not_found",
  source_row_not_suggested: "common_refusal_source_row_not_suggested",
  source_row_on_list: "common_refusal_source_row_on_list",
  source_base_not_in_table: "common_refusal_source_base_not_in_table",
  account_not_found: "common_refusal_account_not_found",
  own_account: "common_refusal_own_account",
  unauthenticated: "common_refusal_unauthenticated",
  not_invited: "sign_in_error_not_invited",
  invalid_link: "sign_in_error_invalid_link",
} as const satisfies Record<RefusalCode, keyof typeof m>;

/**
 * The translated message for a refusal code, in the active locale. A code the map does not
 * know (a newer server) gets the general message, never the raw code.
 */
export function refusalMessage(code: RefusalCode | (string & {})): string {
  const keys: Readonly<Record<string, RefusalMessageKey | undefined>> = REFUSAL_MESSAGE_KEYS;
  const key = keys[code];
  return key === undefined ? m.common_error_unexpected() : m[key]();
}

type RefusalMessageKey = (typeof REFUSAL_MESSAGE_KEYS)[RefusalCode];
