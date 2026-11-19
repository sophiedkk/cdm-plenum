// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import {
  FileTextIcon,
  type LucideIcon,
  PackageCheckIcon,
  StarIcon,
  UserIcon,
  UserStarIcon,
  VoteIcon,
} from "lucide-react";
import { StatusBadge } from "@/components/status/status-badge";
import { projectPhaseLabel, projectRoleLabel } from "@/lib/i18n/labels";
import type { ProjectPhase } from "@/lib/project-phases";
import type { ProjectRole } from "@/lib/project-roles";

const PHASE_ICONS: Record<ProjectPhase, LucideIcon> = {
  scope: FileTextIcon,
  discover: StarIcon,
  decide: VoteIcon,
  handoff: PackageCheckIcon,
};

/** The phase of a project (PR4), with its name. */
export function PhaseBadge({ phase }: Readonly<{ phase: ProjectPhase }>) {
  return <StatusBadge tone="info" icon={PHASE_ICONS[phase]} label={projectPhaseLabel(phase)} />;
}

/** The user's own role in a project. */
export function RoleBadge({ projectRole }: Readonly<{ projectRole: ProjectRole }>) {
  return (
    <StatusBadge
      tone="neutral"
      icon={projectRole === "facilitator" ? UserStarIcon : UserIcon}
      label={projectRoleLabel(projectRole)}
    />
  );
}
