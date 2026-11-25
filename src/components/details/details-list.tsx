// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The Details list (P1, owner decision 2026-11-25, GNOME HIG browsing): the tree of the model as
// one row, then one row per element with where its structure and codes stand and what it asks of
// the viewer. Rows that ask for the viewer come first; settled ones sit in a folded group. Each
// row opens its own view, so a page holds one subject.
import { Link } from "@tanstack/react-router";
import { StatusBadge, type StatusTone } from "@/components/status/status-badge";
import { m } from "@/i18n/messages";
import { type ListRow, listRows, type RowState, treeRowState } from "@/lib/detail-list";
import type { DetailBoard } from "@/lib/details";
import type { TreeBoard } from "@/lib/model-tree";
import { ProposalStatus } from "./detail-card";

const STATE_LABELS: Record<RowState, () => string> = {
  needs_answer: () => m.details_state_needs_answer(),
  objection: () => m.details_state_objection(),
  to_settle: () => m.details_state_to_settle(),
  to_propose: () => m.details_state_to_propose(),
  to_propose_codes: () => m.details_state_to_propose_codes(),
  to_review: () => m.details_state_to_review(),
  answered: () => m.details_state_answered(),
  left: () => m.details_state_left(),
};

const REPORTS: readonly RowState[] = ["answered", "left"];

function StateBadge({ state }: Readonly<{ state: RowState | null }>) {
  if (state === null) return null;
  const tone: StatusTone = REPORTS.includes(state) ? "neutral" : "warning";
  return <StatusBadge tone={tone} label={STATE_LABELS[state]()} />;
}

const ROW = "flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3";
const LINK = "font-semibold underline-offset-4 hover:underline";

function ElementRow({ row, projectId }: Readonly<{ row: ListRow; projectId: string }>) {
  const { element, state } = row;
  const structureSettled = element.proposal?.settledAt != null;
  const showCodes =
    element.reference === null &&
    (structureSettled || element.codes !== null || element.codesInReview);
  return (
    <li className={ROW}>
      <Link
        to="/projects/$projectId/details/$elementId"
        params={{ projectId, elementId: element.id }}
        className={LINK}
      >
        {element.name}
      </Link>
      <div className="flex flex-wrap items-center gap-2">
        <StateBadge state={state} />
        <ProposalStatus
          proposal={element.proposal}
          format={(status) => m.details_list_structure({ status })}
        />
        {showCodes && (
          <ProposalStatus
            proposal={element.codes}
            format={(status) => m.details_list_codes({ status })}
          />
        )}
      </div>
    </li>
  );
}

export function DetailsList({
  projectId,
  board,
  tree,
  facilitator,
}: Readonly<{
  projectId: string;
  board: DetailBoard;
  tree: TreeBoard | null;
  facilitator: boolean;
}>) {
  const viewer = { facilitator, ...board };
  const rows = listRows(board.elements, viewer);
  const settled = rows.filter((row) => row.group === "done");
  const rest = rows.filter((row) => row.group !== "done");
  const treeState =
    tree === null
      ? null
      : treeRowState(tree.proposal, {
          facilitator,
          mayAnswer: tree.mayAnswer,
          mayPropose: tree.mayPropose,
          open: tree.open,
          exists: tree.proposal !== null,
        });
  return (
    <div className="flex flex-col gap-4">
      <ul aria-label={m.details_list_label()} className="divide-y border-y">
        {tree !== null && (
          <li className={ROW}>
            <Link to="/projects/$projectId/details/tree" params={{ projectId }} className={LINK}>
              {m.details_tree()}
            </Link>
            <div className="flex flex-wrap items-center gap-2">
              <StateBadge state={treeState} />
              <ProposalStatus proposal={tree.proposal} />
            </div>
          </li>
        )}
        {rest.map((row) => (
          <ElementRow key={row.element.id} row={row} projectId={projectId} />
        ))}
      </ul>
      {settled.length > 0 && (
        <details>
          <summary className="cursor-pointer font-semibold">
            {m.details_list_done({ count: settled.length })}
          </summary>
          <ul className="mt-2 divide-y border-y">
            {settled.map((row) => (
              <ElementRow key={row.element.id} row={row} projectId={projectId} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
