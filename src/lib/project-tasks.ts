// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// What the project header shows (PR4, PR8, PR11, ADR 0018): the participant's one task for the
// current phase, and the facilitator's short status of it. The server reads the counts; these
// functions only choose what to show, so the choice is tested without a database.
import type { ProjectPhase } from "./project-phases.ts";
import type { ProjectRole } from "./project-roles.ts";

/** The round that takes ratings or waits to be closed: opened and not yet closed. */
export interface OverviewRound {
  id: string;
  number: number;
  /** `awaiting_close`: the closing date has passed and the facilitator has not closed it yet. */
  status: "open" | "awaiting_close";
  closesAt: string;
  /** How many elements the round rates. */
  elements: number;
  /** How many of them the signed-in member answered; null when they do not rate (DE14). */
  rated: number | null;
  /** Raters with an answer for every element, for the facilitator only; otherwise null. */
  completed: number | null;
  /** Raters in the stakeholder groups, for the facilitator only; otherwise null. */
  raters: number | null;
}

/** The counts the overview needs. Nothing in it names a person (Q-ANON-1). */
export interface ProjectOverview {
  phase: ProjectPhase;
  role: ProjectRole;
  /** The concept of the scope statement, for the one line of scope in the header (PR11). */
  concept: string;
  /** The elements on the board, merged ones left out. */
  elements: number;
  /** The elements the signed-in member added themselves, merged ones included. */
  ownElements: number;
  round: OverviewRound | null;
  /** The newest closed round, whose results every member may read (DE5). */
  lastClosedRoundId: string | null;
}

/** The participant's task for the current phase (PR8). */
export type ParticipantTask =
  | { kind: "scope" }
  | { kind: "discover"; added: number }
  | {
      kind: "rate";
      roundId: string;
      number: number;
      rated: number;
      total: number;
      closesAt: string;
    }
  | { kind: "rated_all"; roundId: string; number: number; total: number; closesAt: string }
  | { kind: "round_closing"; number: number }
  | { kind: "wait" }
  | { kind: "handoff"; resultsRoundId: string | null };

/** Chooses the one task a participant sees on the overview. */
export function participantTask(overview: ProjectOverview): ParticipantTask {
  switch (overview.phase) {
    case "scope":
      return { kind: "scope" };
    case "discover":
      return { kind: "discover", added: overview.ownElements };
    case "decide": {
      const round = overview.round;
      if (round === null || round.rated === null) return { kind: "wait" };
      if (round.status === "awaiting_close") return { kind: "round_closing", number: round.number };
      const common = {
        roundId: round.id,
        number: round.number,
        total: round.elements,
        closesAt: round.closesAt,
      };
      return round.rated >= round.elements
        ? { kind: "rated_all", ...common }
        : { kind: "rate", ...common, rated: round.rated };
    }
    case "handoff":
      return { kind: "handoff", resultsRoundId: overview.lastClosedRoundId };
  }
}

/** What the header's task or status line already shows about one round. */
export interface HeaderCover {
  /** The button to the round's rating screen and the count of rated elements. */
  rate: boolean;
  closesAt: boolean;
}

/**
 * What the header already shows about round `roundId`, so a round page does not repeat it: a
 * participant's task to rate it, or the facilitator's status of it while it is open.
 */
export function headerCovers(overview: ProjectOverview, roundId: string): HeaderCover {
  if (overview.role === "facilitator") {
    const status = facilitatorStatus(overview);
    const open = status.kind === "round" && status.roundId === roundId && status.status === "open";
    return { rate: false, closesAt: open };
  }
  const task = participantTask(overview);
  const covered = (task.kind === "rate" || task.kind === "rated_all") && task.roundId === roundId;
  return { rate: covered, closesAt: covered };
}

/** The facilitator's status line for the current phase. */
export type FacilitatorStatus =
  | { kind: "elements"; count: number }
  | {
      kind: "round";
      roundId: string;
      number: number;
      status: OverviewRound["status"];
      completed: number;
      raters: number;
      closesAt: string;
    }
  | { kind: "no_round" };

/** The status a facilitator sees: the open round's response while deciding, else the board. */
export function facilitatorStatus(overview: ProjectOverview): FacilitatorStatus {
  if (overview.phase !== "decide") return { kind: "elements", count: overview.elements };
  const round = overview.round;
  if (round === null) return { kind: "no_round" };
  return {
    kind: "round",
    roundId: round.id,
    number: round.number,
    status: round.status,
    completed: round.completed ?? 0,
    raters: round.raters ?? 0,
    closesAt: round.closesAt,
  };
}
