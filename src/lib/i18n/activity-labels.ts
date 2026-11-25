// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Translated names of the activity log's action codes (AD2), for the administration page. A
// table, so a new code in ACTIVITY_ACTIONS is a type error until it has a label.
import { m } from "@/i18n/messages";
import { ACTIVITY_ACTIONS, movedToPhase } from "@/lib/activity-actions";
import { projectPhaseLabel } from "./labels.ts";

const ACTION_LABELS: Record<(typeof ACTIVITY_ACTIONS)[number], () => string> = {
  account_deactivated: () => m.admin_action_account_deactivated(),
  account_reactivated: () => m.admin_action_account_reactivated(),
  app_role_granted: () => m.admin_action_app_role_granted(),
  app_role_revoked: () => m.admin_action_app_role_revoked(),
  board_revealed: () => m.admin_action_board_revealed(),
  brainstorm_reminder_sent: () => m.admin_action_brainstorm_reminder_sent(),
  change_class_set: () => m.admin_action_change_class_set(),
  ckm_archetype_imported: () => m.admin_action_ckm_archetype_imported(),
  detail_answered: () => m.admin_action_detail_answered(),
  detail_codes_proposed: () => m.admin_action_detail_codes_proposed(),
  detail_flag_removed: () => m.admin_action_detail_flag_removed(),
  detail_flag_saved: () => m.admin_action_detail_flag_saved(),
  detail_objection_addressed: () => m.admin_action_detail_objection_addressed(),
  detail_proposed: () => m.admin_action_detail_proposed(),
  detail_review_approved: () => m.admin_action_detail_review_approved(),
  detail_review_returned: () => m.admin_action_detail_review_returned(),
  detail_review_skipped: () => m.admin_action_detail_review_skipped(),
  detail_settled: () => m.admin_action_detail_settled(),
  element_added: () => m.admin_action_element_added(),
  element_ckm_linked: () => m.admin_action_element_ckm_linked(),
  element_comment_added: () => m.admin_action_element_comment_added(),
  element_group_added: () => m.admin_action_element_group_added(),
  element_group_moved: () => m.admin_action_element_group_moved(),
  element_group_renamed: () => m.admin_action_element_group_renamed(),
  element_imported: () => m.admin_action_element_imported(),
  element_merge_result: () => m.admin_action_element_merge_result(),
  element_merged: () => m.admin_action_element_merged(),
  element_same_as_added: () => m.admin_action_element_same_as_added(),
  element_same_as_removed: () => m.admin_action_element_same_as_removed(),
  element_support_removed: () => m.admin_action_element_support_removed(),
  element_supported: () => m.admin_action_element_supported(),
  element_updated: () => m.admin_action_element_updated(),
  element_values_set: () => m.admin_action_element_values_set(),
  export_elements_csv: () => m.admin_action_export_elements_csv(),
  export_mind_map: () => m.admin_action_export_mind_map(),
  export_decision_report: () => m.admin_action_export_decision_report(),
  export_ratings_csv: () => m.admin_action_export_ratings_csv(),
  group_check_asked: () => m.admin_action_group_check_asked(),
  group_created: () => m.admin_action_group_created(),
  group_names_hidden: () => m.admin_action_group_names_hidden(),
  group_names_shown: () => m.admin_action_group_names_shown(),
  group_removed: () => m.admin_action_group_removed(),
  group_renamed: () => m.admin_action_group_renamed(),
  invitation_accepted: () => m.admin_action_invitation_accepted(),
  invitation_created: () => m.admin_action_invitation_created(),
  invitation_revoked: () => m.admin_action_invitation_revoked(),
  member_left: () => m.admin_action_member_left(),
  panel_minimum_set: () => m.admin_action_panel_minimum_set(),
  private_brainstorm_off: () => m.admin_action_private_brainstorm_off(),
  private_brainstorm_on: () => m.admin_action_private_brainstorm_on(),
  model_type_set: () => m.admin_action_model_type_set(),
  project_created: () => m.admin_action_project_created(),
  proposal_added: () => m.admin_action_proposal_added(),
  proposal_added_to_board: () => m.admin_action_proposal_added_to_board(),
  proposal_deleted: () => m.admin_action_proposal_deleted(),
  rater_group_joined: () => m.admin_action_rater_group_joined(),
  rater_group_left: () => m.admin_action_rater_group_left(),
  rating_cleared: () => m.admin_action_rating_cleared(),
  rating_saved: () => m.admin_action_rating_saved(),
  round_closed: () => m.admin_action_round_closed(),
  round_created: () => m.admin_action_round_created(),
  round_opened: () => m.admin_action_round_opened(),
  round_updated: () => m.admin_action_round_updated(),
  scope_comment_added: () => m.admin_action_scope_comment_added(),
  source_base_cleared: () => m.admin_action_source_base_cleared(),
  source_base_set: () => m.admin_action_source_base_set(),
  source_model_added: () => m.admin_action_source_model_added(),
  source_model_imported: () => m.admin_action_source_model_imported(),
  source_match_rejected: () => m.admin_action_source_match_rejected(),
  source_suggestion_accepted: () => m.admin_action_source_suggestion_accepted(),
  source_suggestion_dismissed: () => m.admin_action_source_suggestion_dismissed(),
  scope_source_added: () => m.admin_action_scope_source_added(),
  scope_source_removed: () => m.admin_action_scope_source_removed(),
  scope_sources_reordered: () => m.admin_action_scope_sources_reordered(),
  scope_updated: () => m.admin_action_scope_updated(),
  signed_in: () => m.admin_action_signed_in(),
  value_list_added: () => m.admin_action_value_list_added(),
  value_list_applied: () => m.admin_action_value_list_applied(),
  value_list_removed: () => m.admin_action_value_list_removed(),
  tree_proposed: () => m.admin_action_tree_proposed(),
};

function isListed(action: string): action is (typeof ACTIVITY_ACTIONS)[number] {
  return (ACTIVITY_ACTIONS as readonly string[]).includes(action);
}

/** The name of an action code in the active locale; an unknown code shows as it is stored. */
export function activityLabel(action: string): string {
  if (isListed(action)) return ACTION_LABELS[action]();
  const phase = movedToPhase(action);
  if (phase !== null) return m.admin_action_phase_moved({ phase: projectPhaseLabel(phase) });
  return action;
}
