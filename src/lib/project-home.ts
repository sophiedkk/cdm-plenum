// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// What the participant's project home and the facilitator's Overview show (PR4, PR8, PR11): the
// elements decided so far, the checklist of the phase and the one line the projects list shows
// per project. The server reads the facts; these functions only choose what to show, so the
// choice is tested without a database.
import type { Outcome } from "./consensus.ts";
import { adjacentPhase, type ProjectPhase } from "./project-phases.ts";
import { type ParticipantTask, type ProjectOverview, participantTask } from "./project-tasks.ts";

/**
 * Where an element stands: the outcome of the newest closed round that rated it, or
 * `not_rated` when no closed round rated it yet.
 */
export type DecidedStatus = Outcome | "not_rated";

/** The order of the statuses on the home: in, not in, still open, not rated yet. */
export const DECIDED_STATUSES = [
  "included",
  "excluded",
  "no_consensus",
  "not_rated",
] as const satisfies readonly DecidedStatus[];

export interface DecidedElement {
  id: string;
  name: string;
  status: DecidedStatus;
}

/** A closed round, for the link to its results. */
export interface ClosedRound {
  id: string;
  number: number;
}

/** The elements of the board with where each stands, and the newest closed round. */
export interface DecidedSoFar {
  elements: DecidedElement[];
  lastClosedRound: ClosedRound | null;
}

/** The elements per status, in the order of {@link DECIDED_STATUSES}; empty statuses left out. */
export function decidedGroups(
  elements: readonly DecidedElement[],
): { status: DecidedStatus; elements: DecidedElement[] }[] {
  return DECIDED_STATUSES.map((status) => ({
    status,
    elements: elements.filter((element) => element.status === status),
  })).filter((group) => group.elements.length > 0);
}

/** The round the facilitator follows: the newest round that is not closed. */
export interface ChecklistRound {
  id: string;
  number: number;
  status: "draft" | "open" | "awaiting_close";
  closesAt: string;
  /** Raters with an answer for every element. */
  completed: number;
  /** Raters in the stakeholder groups. */
  raters: number;
}

/** The facts of the facilitator's checklist (facilitator only). Nothing in it names a person. */
export interface OverviewFacts {
  /** Whether the scope statement names the concept. */
  scopeWritten: boolean;
  /** The comments on the scope. */
  scopeComments: number;
  /** People still to invite before joined and invited people reach the minimum panel (DE11). */
  panelMissing: number;
  /** Participants of the project. */
  participants: number;
  /** Participants who added at least one element. */
  contributors: number;
  /** Elements on the board, merged ones left out. */
  elements: number;
  privateBrainstorm: boolean;
  boardRevealed: boolean;
  /** Pairs of elements members marked as the same (EL16). */
  duplicates: number;
  /** Elements linked to an archetype in openEHR CKM (EX2). */
  ckmLinked: number;
  round: ChecklistRound | null;
  /** Elements without a decision: no consensus in their newest closed round, or not rated. */
  undecided: number;
  lastClosedRound: ClosedRound | null;
  /** Whether the server can send e-mail, so a reminder can go out. */
  mailConfigured: boolean;
}

/**
 * One item of the checklist. `done` is null for an item that only informs, such as the number
 * of scope comments: nothing marks them read.
 */
export type ChecklistItem =
  | { key: "scope_written"; done: boolean }
  | { key: "panel"; done: boolean; missing: number }
  | { key: "scope_comments"; done: null; count: number }
  | {
      key: "contributions";
      done: boolean;
      contributors: number;
      participants: number;
      remind: boolean;
    }
  | { key: "reveal"; done: boolean }
  | { key: "duplicates"; done: boolean; count: number }
  | { key: "compare"; done: boolean; linked: number }
  | { key: "round"; done: false; round: ChecklistRound | null; closed: ClosedRound | null }
  | { key: "undecided"; done: boolean; count: number };

/** The checklist of the phase the project is in; hand-off has none, its Overview exports. */
export function checklist(phase: ProjectPhase, facts: OverviewFacts): ChecklistItem[] {
  switch (phase) {
    case "scope":
      return [
        { key: "scope_written", done: facts.scopeWritten },
        { key: "panel", done: facts.panelMissing === 0, missing: facts.panelMissing },
        { key: "scope_comments", done: null, count: facts.scopeComments },
      ];
    case "discover": {
      const everyone = facts.participants > 0 && facts.contributors >= facts.participants;
      const items: ChecklistItem[] = [
        {
          key: "contributions",
          done: everyone,
          contributors: facts.contributors,
          participants: facts.participants,
          remind: !everyone && facts.participants > 0 && facts.mailConfigured,
        },
      ];
      // A board shared from the start needs no reveal (EL13).
      if (facts.privateBrainstorm) items.push({ key: "reveal", done: facts.boardRevealed });
      items.push(
        { key: "duplicates", done: facts.duplicates === 0, count: facts.duplicates },
        { key: "compare", done: facts.ckmLinked > 0, linked: facts.ckmLinked },
      );
      return items;
    }
    case "decide": {
      const items: ChecklistItem[] = [];
      // A round is to do while one runs, or while elements wait for a decision.
      if (facts.round !== null || facts.undecided > 0) {
        items.push({
          key: "round",
          done: false,
          round: facts.round,
          closed: facts.lastClosedRound,
        });
      }
      items.push({
        key: "undecided",
        done: facts.elements > 0 && facts.undecided === 0,
        count: facts.undecided,
      });
      return items;
    }
    case "handoff":
      return [];
  }
}

/** The items still to do; an item that only informs never counts. */
export function openItems(items: readonly ChecklistItem[]): number {
  return items.filter((item) => item.done === false).length;
}

/** What waits for the person in a project, for its row in the projects list. */
export type Waiting =
  | { kind: "task"; task: ParticipantTask }
  | { kind: "checklist"; open: number; next: ProjectPhase; round: ChecklistRound | null }
  | { kind: "ready"; next: ProjectPhase }
  | { kind: "nothing" };

/**
 * What waits for a participant: their task while it asks something of them; for the
 * facilitator: the open items of the checklist before the next phase.
 */
export function waitingFor(overview: ProjectOverview, facts: OverviewFacts | null): Waiting {
  if (overview.role === "facilitator" && facts !== null) {
    const next = adjacentPhase(overview.phase, "next");
    if (next === null) return { kind: "nothing" };
    const open = openItems(checklist(overview.phase, facts));
    if (open === 0) return { kind: "ready", next };
    return {
      kind: "checklist",
      open,
      next,
      round: facts.round?.status === "open" ? facts.round : null,
    };
  }
  const task = participantTask(overview);
  if (task.kind === "scope" || task.kind === "discover" || task.kind === "rate") {
    return { kind: "task", task };
  }
  return { kind: "nothing" };
}

/** Where a participant's phase step leads: a page of the project, by route. */
export type StepTarget =
  | { to: "/projects/$projectId/scope" | "/projects/$projectId/board" }
  | {
      to: "/projects/$projectId/rounds/$roundId/rate" | "/projects/$projectId/rounds/$roundId";
      roundId: string;
    };

/**
 * The page a participant's step opens, or null when the phase has nothing to show them yet:
 * Scope the scope, Discover the elements, Decide the round they rate or the newest results.
 * Hand-off has no page of its own; its results are Decide's. Every target is a step the phase
 * table shows a participant once the phase is done or current (PR9).
 */
export function stepTarget(phase: ProjectPhase, overview: ProjectOverview): StepTarget | null {
  switch (phase) {
    case "scope":
      return { to: "/projects/$projectId/scope" };
    case "discover":
      return { to: "/projects/$projectId/board" };
    case "decide": {
      const round = overview.round;
      if (overview.phase === "decide" && round !== null && round.rated !== null) {
        return { to: "/projects/$projectId/rounds/$roundId/rate", roundId: round.id };
      }
      return overview.lastClosedRoundId === null
        ? null
        : { to: "/projects/$projectId/rounds/$roundId", roundId: overview.lastClosedRoundId };
    }
    case "handoff":
      return null;
  }
}
