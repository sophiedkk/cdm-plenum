// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The participant's one task for the current phase (PR8, ADR 0019), shown on the project home
// and in the projects list. The server reads the counts; this function only chooses the task,
// so the choice is tested without a database.
import type { ProjectPhase } from "./project-phases.ts";
import type { ProjectRole } from "./project-roles.ts";

/** The round that takes ratings or waits to be closed: opened and not yet closed. */
export interface OverviewRound {
  id: string;
  /** What the round rates: elements (decide), or values of structure proposals (detail, DT3). */
  kind: "elements" | "values";
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
  /** The elements on the board, merged ones left out. */
  elements: number;
  /** The elements the signed-in member added themselves, merged ones included. */
  ownElements: number;
  /** The first look (EL22): elements from existing models, and how many the member answered. */
  firstLook: { total: number; answered: number };
  /** The check of the groups (EL24): whether the facilitator asked, and the member is done. */
  groupCheck: { asked: boolean; done: boolean };
  round: OverviewRound | null;
  /** The open structure proposals and how many the member answered in their current version (DT2). */
  detail: { open: number; answered: number; toReview: number };
  /** The newest closed round, whose results every member may read (DE5). */
  lastClosedRoundId: string | null;
}

/** The participant's task for the current phase (PR8). */
export type ParticipantTask =
  | { kind: "scope" }
  | {
      kind: "discover";
      added: number;
      firstLook: { total: number; answered: number };
      groupCheck: { asked: boolean; done: boolean };
    }
  | {
      kind: "rate";
      /** Whether the round rates elements or values (DT3). */
      roundKind: "elements" | "values";
      roundId: string;
      number: number;
      rated: number;
      total: number;
      closesAt: string;
    }
  | { kind: "rated_all"; roundId: string; number: number; total: number; closesAt: string }
  | { kind: "round_closing"; number: number }
  | { kind: "wait" }
  | { kind: "detail"; open: number; answered: number; toReview: number }
  | { kind: "detail_answered" }
  | { kind: "handoff"; resultsRoundId: string | null };

/** Chooses the one task a participant sees on the overview. */
export function participantTask(overview: ProjectOverview): ParticipantTask {
  switch (overview.phase) {
    case "scope":
      return { kind: "scope" };
    case "discover":
      return {
        kind: "discover",
        added: overview.ownElements,
        firstLook: overview.firstLook,
        groupCheck: overview.groupCheck,
      };
    case "decide": {
      const round = overview.round?.kind === "elements" ? overview.round : null;
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
        : { kind: "rate", roundKind: "elements", ...common, rated: round.rated };
    }
    case "detail": {
      // NOTE: DT3, owner decision 2026-11-24. An open value round asks for ratings first; once
      // the member rated every value, the answers to the proposals are the task.
      const round = overview.round;
      if (
        round?.kind === "values" &&
        round.status === "open" &&
        round.rated !== null &&
        round.rated < round.elements
      ) {
        return {
          kind: "rate",
          roundKind: "values",
          roundId: round.id,
          number: round.number,
          total: round.elements,
          closesAt: round.closesAt,
          rated: round.rated,
        };
      }
      // NOTE: DT2. Only a participant answers; the facilitator settles.
      const { open, answered, toReview } = overview.detail;
      if (overview.role !== "participant" || (open === 0 && toReview === 0)) {
        return { kind: "wait" };
      }
      // NOTE: DT4. A terminologist's review comes before the group's answers, so it is a task.
      return answered >= open && toReview === 0
        ? { kind: "detail_answered" }
        : { kind: "detail", ...overview.detail };
    }
    case "handoff":
      return { kind: "handoff", resultsRoundId: overview.lastClosedRoundId };
  }
}
