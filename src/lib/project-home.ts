// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// What the participant's project home and the facilitator's Overview show (PR4, PR8, PR11): the
// elements decided so far, the checklist of the phase and the one line the projects list shows
// per project. The server reads the facts; these functions only choose what to show, so the
// choice is tested without a database.
import type { Outcome } from "./consensus.ts";
import { participantAccess } from "./phase-access.ts";
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
  /** Whether the facilitator chose the model type (SC4). */
  modelTypeSet: boolean;
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
  /** Existing models with elements on the list (EL12, ADR 0020). */
  importedModels: number;
  /** Elements in the participants' first look (EL22). */
  firstLookTotal: number;
  /** Participants who answered every element of the first look. */
  firstLookFinished: number;
  /** Whether the facilitator asked the participants to check the groups (EL24). */
  groupCheckAsked: boolean;
  /** Participants who said they are done checking. */
  groupChecked: number;
  /** Elements on the list that came from existing models, merged ones left out (EL7). */
  listedFromModels: number;
  round: ChecklistRound | null;
  /** The value round the facilitator follows in the detail phase (DT3). */
  valueRound: ChecklistRound | null;
  /** Elements without a decision: no consensus in their newest closed round, or not rated. */
  undecided: number;
  lastClosedRound: ClosedRound | null;
  /** The structure step of the detail phase (DT1, DT2): counts of elements and objections. */
  detail: {
    inModel: number;
    proposed: number;
    settled: number;
    codable: number;
    codesSettled: number;
    openObjections: number;
  };
  /** Whether the server can send e-mail, so a reminder can go out. */
  mailConfigured: boolean;
}

/**
 * One item of the checklist. `done` is null for an item that only informs, such as the number
 * of scope comments: nothing marks them read.
 */
export type ChecklistItem =
  | { key: "scope_written"; done: boolean }
  | { key: "model_type"; done: boolean }
  | { key: "panel"; done: boolean; missing: number }
  | { key: "scope_comments"; done: null; count: number }
  | {
      key: "first_look";
      done: boolean;
      finished: number;
      participants: number;
      total: number;
      remind: boolean;
    }
  | { key: "contributions"; done: boolean; contributors: number; participants: number }
  | { key: "grouping"; done: boolean; asked: boolean; checked: number; participants: number }
  | { key: "models"; done: boolean; models: number; elements: number }
  | {
      key: "cleanup";
      done: boolean;
      /** Whether the board is revealed; null when the brainstorm was never private (EL13). */
      revealed: boolean | null;
      duplicates: number;
    }
  | { key: "round"; done: false; round: ChecklistRound | null; closed: ClosedRound | null }
  | { key: "value_round"; done: false; round: ChecklistRound }
  | { key: "undecided"; done: boolean; count: number }
  | { key: "detail_proposed"; done: boolean; proposed: number; inModel: number }
  | { key: "detail_objections"; done: boolean; count: number }
  | { key: "detail_settled"; done: boolean; settled: number; inModel: number }
  | { key: "detail_codes"; done: null; settled: number; inModel: number };

/** The checklist of the phase the project is in; hand-off has none, its Overview exports. */
export function checklist(phase: ProjectPhase, facts: OverviewFacts): ChecklistItem[] {
  switch (phase) {
    case "scope":
      return [
        { key: "scope_written", done: facts.scopeWritten },
        { key: "model_type", done: facts.modelTypeSet },
        { key: "panel", done: facts.panelMissing === 0, missing: facts.panelMissing },
        { key: "scope_comments", done: null, count: facts.scopeComments },
      ];
    case "discover": {
      // NOTE: ADR 0020. Discover in parts: existing models, what is missing, reveal and clean
      // up; each item opens the page where it is done.
      const everyone = facts.participants > 0 && facts.contributors >= facts.participants;
      const looked =
        facts.firstLookTotal > 0 &&
        facts.participants > 0 &&
        facts.firstLookFinished >= facts.participants;
      // A board shared from the start needs no reveal (EL13).
      const revealed = facts.privateBrainstorm ? facts.boardRevealed : null;
      return [
        {
          key: "models",
          done: facts.importedModels > 0,
          models: facts.importedModels,
          elements: facts.listedFromModels,
        },
        {
          key: "first_look",
          done: looked,
          finished: facts.firstLookFinished,
          participants: facts.participants,
          total: facts.firstLookTotal,
          remind:
            !looked && facts.firstLookTotal > 0 && facts.participants > 0 && facts.mailConfigured,
        },
        {
          key: "contributions",
          done: everyone,
          contributors: facts.contributors,
          participants: facts.participants,
        },
        {
          key: "cleanup",
          done: revealed !== false && facts.duplicates === 0,
          revealed,
          duplicates: facts.duplicates,
        },
        {
          key: "grouping",
          done: facts.groupCheckAsked,
          asked: facts.groupCheckAsked,
          checked: facts.groupChecked,
          participants: facts.participants,
        },
      ];
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
    case "detail": {
      const { inModel, proposed, settled, codable, codesSettled, openObjections } = facts.detail;
      // NOTE: DT3. A value round shows while it is a draft or runs, as the decide round does.
      const valueRound: ChecklistItem[] =
        facts.valueRound === null
          ? []
          : [{ key: "value_round", done: false, round: facts.valueRound }];
      return [
        ...valueRound,
        { key: "detail_proposed", done: inModel > 0 && proposed >= inModel, proposed, inModel },
        { key: "detail_objections", done: openObjections === 0, count: openObjections },
        { key: "detail_settled", done: inModel > 0 && settled >= inModel, settled, inModel },
        // NOTE: DT4. Open codes do not hold up the hand-off, so this item only informs.
        { key: "detail_codes", done: null, settled: codesSettled, inModel: codable },
      ];
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
  | {
      kind: "checklist";
      open: number;
      next: ProjectPhase;
      round: ChecklistRound | null;
      /** What the followed round rates: elements in decide, values in detail (DT3). */
      roundKind: "elements" | "values";
    }
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
    const round = overview.phase === "detail" ? facts.valueRound : facts.round;
    return {
      kind: "checklist",
      open,
      next,
      round: round?.status === "open" ? round : null,
      roundKind: overview.phase === "detail" ? "values" : "elements",
    };
  }
  const task = participantTask(overview);
  if (
    task.kind === "scope" ||
    task.kind === "discover" ||
    task.kind === "rate" ||
    task.kind === "detail"
  ) {
    return { kind: "task", task };
  }
  return { kind: "nothing" };
}

/** A page a participant reads from the home besides their task: the scope or the elements. */
export type HomePage = "scope" | "board";

/**
 * The pages the participant's home links to besides the task (ADR 0019): the scope and the
 * elements, each while the phase table shows it to a participant (PR9). The scope phase leaves
 * the scope out, because "Your turn" leads there. The newest results are linked from "Decided so
 * far", so they are not repeated here.
 */
export function homePages(phase: ProjectPhase): HomePage[] {
  return (["scope", "board"] as const).filter(
    (page) =>
      participantAccess(phase, page) !== "hidden" && !(page === "scope" && phase === "scope"),
  );
}
