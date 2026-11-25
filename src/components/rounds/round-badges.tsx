// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import {
  CircleCheckIcon,
  CircleHelpIcon,
  CircleXIcon,
  ClockIcon,
  LockIcon,
  type LucideIcon,
  PencilIcon,
  VoteIcon,
} from "lucide-react";
import { StatusBadge, type StatusTone } from "@/components/status/status-badge";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/consensus";
import { consentOutcomeLabel, outcomeLabel, roundStatusLabel } from "@/lib/i18n/round-labels";
import type { RoundStatus } from "@/server/rounds/round";

const STATUS_STYLE: Record<RoundStatus, { tone: StatusTone; icon: LucideIcon }> = {
  draft: { tone: "neutral", icon: PencilIcon },
  open: { tone: "info", icon: VoteIcon },
  awaiting_close: { tone: "warning", icon: ClockIcon },
  closed: { tone: "neutral", icon: LockIcon },
};

const OUTCOME_STYLE: Record<Outcome, { tone: StatusTone; icon: LucideIcon }> = {
  included: { tone: "success", icon: CircleCheckIcon },
  excluded: { tone: "danger", icon: CircleXIcon },
  no_consensus: { tone: "warning", icon: CircleHelpIcon },
};

/** The state of a round: draft, open, awaiting close or closed, in words. */
export function RoundStatusBadge({ status }: Readonly<{ status: RoundStatus }>) {
  const style = STATUS_STYLE[status];
  return <StatusBadge tone={style.tone} icon={style.icon} label={roundStatusLabel(status)} />;
}

/**
 * The outcome of an element under the round's rule, in words (Q-ACC-2). A value of a value
 * round is kept in its list or left out of it (DT3).
 */
export function OutcomeBadge({
  outcome,
  kind = "elements",
  consent = false,
}: Readonly<{
  outcome: Outcome;
  kind?: "elements" | "values";
  /** A Team round (DE20): the words are "In the model", "Not in the model" and "To discuss". */
  consent?: boolean;
}>) {
  const style = OUTCOME_STYLE[outcome];
  const label = consent
    ? consentOutcomeLabel(outcome)
    : kind === "values" && outcome !== "no_consensus"
      ? outcome === "included"
        ? m.rounds_value_outcome_included()
        : m.rounds_value_outcome_excluded()
      : outcomeLabel(outcome);
  return <StatusBadge tone={style.tone} icon={style.icon} label={label} />;
}
