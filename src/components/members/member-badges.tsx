// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import {
  BlocksIcon,
  BookTextIcon,
  CircleCheckIcon,
  CircleSlashIcon,
  ClockAlertIcon,
  type LucideIcon,
  MailIcon,
  StethoscopeIcon,
} from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/status/status-badge";
import { m } from "@/i18n/messages";
import { expertTypeLabel } from "@/lib/i18n/labels";
import type { ExpertType } from "@/lib/project-roles";
import type { InvitationStatus } from "@/server/invitations/queries";

const EXPERT_TYPE_ICONS: Record<ExpertType, LucideIcon> = {
  clinical: StethoscopeIcon,
  terminology: BookTextIcon,
  architecture: BlocksIcon,
};

/** The expert type of a stakeholder group (PR6), with its name. */
export function ExpertTypeBadge({ expertType }: Readonly<{ expertType: ExpertType }>) {
  return (
    <StatusBadge
      tone="neutral"
      icon={EXPERT_TYPE_ICONS[expertType]}
      label={expertTypeLabel(expertType)}
    />
  );
}

const INVITATION_STATUS: Record<
  InvitationStatus,
  { label: () => string; tone: StatusTone; icon: LucideIcon }
> = {
  pending: { label: () => m.members_invitation_status_pending(), tone: "info", icon: MailIcon },
  accepted: {
    label: () => m.members_invitation_status_accepted(),
    tone: "success",
    icon: CircleCheckIcon,
  },
  expired: {
    label: () => m.members_invitation_status_expired(),
    tone: "warning",
    icon: ClockAlertIcon,
  },
  canceled: {
    label: () => m.members_invitation_status_canceled(),
    tone: "neutral",
    icon: CircleSlashIcon,
  },
};

/** Where an invitation stands (PR3), with its name. */
export function InvitationStatusBadge({ status }: Readonly<{ status: InvitationStatus }>) {
  const { label, tone, icon } = INVITATION_STATUS[status];
  return <StatusBadge tone={tone} icon={icon} label={label()} />;
}
