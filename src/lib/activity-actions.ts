// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Every action code the activity log stores (AD2). The server writes only these, so the
// administration page has a translated label for each.
import { PROJECT_PHASES, type ProjectPhase } from "./project-phases.ts";

export const ACTIVITY_ACTIONS = [
  "account_deactivated",
  "account_reactivated",
  "app_role_granted",
  "app_role_revoked",
  "board_revealed",
  "brainstorm_reminder_sent",
  "change_class_set",
  "ckm_archetype_imported",
  "detail_answered",
  "detail_codes_proposed",
  "detail_flag_removed",
  "detail_flag_saved",
  "detail_objection_addressed",
  "detail_proposed",
  "detail_review_approved",
  "detail_review_returned",
  "detail_review_skipped",
  "detail_settled",
  "element_added",
  "element_ckm_linked",
  "element_comment_added",
  "element_group_added",
  "element_group_moved",
  "element_group_renamed",
  "element_imported",
  "element_merge_result",
  "element_merged",
  "element_same_as_added",
  "element_same_as_removed",
  "element_support_removed",
  "element_supported",
  "element_updated",
  "element_values_set",
  "export_decision_report",
  "export_elements_csv",
  "export_mind_map",
  "export_ratings_csv",
  "group_check_asked",
  "group_created",
  "group_names_hidden",
  "group_names_shown",
  "group_removed",
  "group_renamed",
  "invitation_accepted",
  "invitation_created",
  "invitation_restored",
  "invitation_revoked",
  "member_left",
  "model_type_set",
  "panel_minimum_set",
  "private_brainstorm_off",
  "private_brainstorm_on",
  "project_created",
  "proposal_added",
  "proposal_added_to_board",
  "proposal_deleted",
  "rater_group_joined",
  "rater_group_left",
  "rating_cleared",
  "rating_saved",
  "round_closed",
  "round_created",
  "round_opened",
  "round_updated",
  "scope_comment_added",
  "source_base_cleared",
  "source_base_set",
  "source_model_added",
  "source_model_imported",
  "source_match_rejected",
  "source_suggestion_accepted",
  "source_suggestion_dismissed",
  "scope_source_added",
  "scope_source_removed",
  "scope_sources_reordered",
  "scope_updated",
  "signed_in",
  "value_list_added",
  "value_list_applied",
  "value_list_removed",
  "tree_proposed",
] as const;

/** The project moved to a phase; one code per phase. */
export type PhaseMoveAction = `phase_moved_to_${ProjectPhase}`;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number] | PhaseMoveAction;

/** The phase of a `phase_moved_to_*` code, or null for any other code. */
export function movedToPhase(action: string): ProjectPhase | null {
  const prefix = "phase_moved_to_";
  if (!action.startsWith(prefix)) return null;
  const phase = action.slice(prefix.length);
  return PROJECT_PHASES.find((known) => known === phase) ?? null;
}
