// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The rows of the Details list (P1, owner decision 2026-11-25): for each element what the viewer
// can do about it now, and the order that puts those first, then the elements that wait, then the
// settled ones in a folded group.
import {
  type CodeProposal,
  type ConsentState,
  type DetailElement,
  openObjections,
  reviewDone,
} from "./details.ts";

/** What a row asks of the viewer, or, for "answered" and "left", where their own answer stands. */
export const ROW_STATES = [
  "needs_answer",
  "objection",
  "to_settle",
  "to_propose",
  "to_propose_codes",
  "to_review",
  "answered",
  "left",
] as const;
export type RowState = (typeof ROW_STATES)[number];

/** The states that ask the viewer to act; "answered" and "left" only report. */
const ACTIONABLE: readonly RowState[] = [
  "needs_answer",
  "objection",
  "to_settle",
  "to_propose",
  "to_propose_codes",
  "to_review",
];

export type RowGroup = "todo" | "waiting" | "done";

/** What the viewer may do on the Details page; the board and the tree board both carry it. */
export interface Viewer {
  facilitator: boolean;
  mayAnswer: boolean;
  mayPropose: boolean;
  mayProposeCodes?: boolean;
  mayReview?: boolean;
  /** Whether the phase takes answers, notes and settling. */
  open: boolean;
}

/** The state one proposal puts its element in, for a proposal the group may answer. */
function consentRowState(proposal: ConsentState | null, viewer: Viewer): RowState | null {
  if (proposal === null || proposal.settledAt !== null) return null;
  if (viewer.facilitator) {
    if (!viewer.open) return null;
    return openObjections(proposal).length > 0 ? "objection" : "to_settle";
  }
  if (!viewer.mayAnswer) return null;
  if (proposal.own === null) return "needs_answer";
  return proposal.own.answer === "leave" ? "left" : "answered";
}

function codesRowState(codes: CodeProposal | null, viewer: Viewer): RowState | null {
  if (codes === null || codes.settledAt !== null) return null;
  const { state, ownProposal, skippable } = codes.review;
  if (state === "pending") {
    if (viewer.facilitator) return viewer.open && skippable ? "to_review" : null;
    return viewer.mayReview && !ownProposal ? "to_review" : null;
  }
  return reviewDone(state) ? consentRowState(codes, viewer) : null;
}

/** The state of the tree row: the tree proposal is answered and settled like a structure. */
export function treeRowState(
  proposal: ConsentState | null,
  viewer: Viewer & { exists: boolean },
): RowState | null {
  if (!viewer.exists) return viewer.mayPropose ? "to_propose" : null;
  return consentRowState(proposal, viewer);
}

/** An element is done when its structure is settled and, unless it is a reference, its codes. */
function elementDone(element: DetailElement): boolean {
  if (element.proposal?.settledAt == null) return false;
  return element.reference !== null || element.codes?.settledAt != null;
}

export interface ListRow {
  element: DetailElement;
  state: RowState | null;
  group: RowGroup;
}

/**
 * The state of one element for the viewer: an action beats a report, and the structure comes
 * before the codes.
 */
export function elementRowState(element: DetailElement, viewer: Viewer): RowState | null {
  const structure =
    element.proposal === null
      ? viewer.mayPropose
        ? "to_propose"
        : null
      : consentRowState(element.proposal, viewer);
  const structureSettled = element.proposal?.settledAt != null;
  const codes =
    element.reference !== null || !structureSettled
      ? null
      : element.codes === null
        ? viewer.mayProposeCodes
          ? "to_propose_codes"
          : null
        : codesRowState(element.codes, viewer);
  const states = [structure, codes].filter((state): state is RowState => state !== null);
  return (
    states.find((state) => ACTIONABLE.includes(state)) ??
    states.find((state) => state === "answered") ??
    states[0] ??
    null
  );
}

/** The rows in list order: what asks for the viewer first, then what waits, then what is done. */
export function listRows(elements: readonly DetailElement[], viewer: Viewer): ListRow[] {
  const rows = elements.map((element): ListRow => {
    const state = elementRowState(element, viewer);
    const group: RowGroup =
      state !== null && ACTIONABLE.includes(state)
        ? "todo"
        : elementDone(element)
          ? "done"
          : "waiting";
    return { element, state, group };
  });
  // The sort is stable, so the board's order holds within a group.
  const rank: Record<RowGroup, number> = { todo: 0, waiting: 1, done: 2 };
  return rows.sort((a, b) => rank[a.group] - rank[b.group]);
}

/** The first element, other than the current one, that waits for the participant's answer. */
export function nextToAnswer(rows: readonly ListRow[], currentId: string): string | null {
  return (
    rows.find((row) => row.state === "needs_answer" && row.element.id !== currentId)?.element.id ??
    null
  );
}
