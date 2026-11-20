// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The one map from a refusal code the server returns to the message the screen shows (ADR 0007).
// The codes are imported as types only, so no server module reaches the browser bundle;
// refusals.test.ts checks the map against the server's code lists and both catalogues.
import { m } from "@/i18n/messages";
import type { SignInError } from "@/lib/sign-in";
import type { AdminActionError } from "@/server/admin/queries";
import type { CkmActionError } from "@/server/ckm/queries";
import type { ProjectActionError } from "@/server/projects/access";
import type { RoundActionError } from "@/server/rounds/access";

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
  | AdminActionError
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
  board_already_revealed: "common_refusal_board_already_revealed",
  minimum_reason_required: "common_refusal_minimum_reason_required",
  ckm_unreachable: "common_refusal_ckm_unreachable",
  ckm_timeout: "common_refusal_ckm_timeout",
  ckm_refused: "common_refusal_ckm_refused",
  ckm_unusable: "common_refusal_ckm_unusable",
  ckm_revision_changed: "common_refusal_ckm_revision_changed",
  ckm_element_not_found: "common_refusal_ckm_element_not_found",
  ckm_no_elements: "common_refusal_ckm_no_elements",
  ckm_already_imported: "common_refusal_ckm_already_imported",
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
