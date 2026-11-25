// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The tree of the model on the Details page (DT6), above the elements: the open proposal, or the
// tree the project has now, then the consent of DT2 as on an element card. The editor opens
// below its button, so the button keeps its place.
import { PencilIcon } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import type { TreeBoard, TreeInput } from "@/lib/model-tree";
import { ConsentPart, type DetailActions, ProposalStatus } from "./detail-card";
import { ModelTreeView } from "./model-tree";
import { TreeForm } from "./tree-form";

export function TreeSection({
  board,
  facilitator,
  actions,
  proposeTree,
}: Readonly<{
  board: TreeBoard;
  facilitator: boolean;
  actions: DetailActions;
  proposeTree: (version: number, tree: TreeInput) => Promise<Outcome<unknown>>;
}>) {
  const headingId = useId();
  const [editing, setEditing] = useState(false);
  const { proposal, current, mayPropose, mayAnswer, open } = board;
  const openProposal = proposal !== null && proposal.settledAt === null;
  const title = m.details_tree();
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={headingId} className="type-section">
          {title}
        </h3>
        <ProposalStatus proposal={proposal} />
      </div>
      <ModelTreeView tree={openProposal ? proposal.tree : current} label={title} />
      {proposal === null ? (
        <p className="text-muted-foreground">{m.details_no_proposal()}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {proposal.proposedBy === "facilitator"
            ? m.details_by_facilitator({ version: proposal.version })
            : m.details_by_architecture({ version: proposal.version })}
        </p>
      )}
      {proposal !== null && (
        <ConsentPart
          name={title}
          settleLabel={title}
          proposal={proposal}
          mayAnswer={mayAnswer}
          facilitator={facilitator}
          open={open}
          actions={actions}
        />
      )}
      {mayPropose && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={editing}
            onClick={() => setEditing(!editing)}
          >
            <PencilIcon aria-hidden="true" data-icon="inline-start" />
            {proposal === null ? m.details_tree_propose() : m.details_tree_revise()}
          </Button>
          {editing && (
            <div className="mt-4 flex flex-col gap-3 border-t pt-4">
              <p className="text-sm text-muted-foreground">{m.details_tree_description()}</p>
              <TreeForm
                initial={openProposal ? proposal.tree : current}
                submitLabel={m.details_propose_submit()}
                submit={(tree) => proposeTree(proposal?.version ?? 0, tree)}
                onDone={async () => {
                  toast.success(m.details_tree_proposed());
                  setEditing(false);
                  await actions.onChanged();
                }}
                actions={
                  <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                    {m.common_cancel()}
                  </Button>
                }
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
