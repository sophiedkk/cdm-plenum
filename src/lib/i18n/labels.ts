// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Translated names of the values the screens show: project roles and phases. A table per value
// set, so a new role or phase is a type error until it has a label.
import { m } from "@/i18n/messages";
import type { ProjectPhase } from "@/lib/project-phases";
import type { ProjectRole } from "@/lib/project-roles";

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
