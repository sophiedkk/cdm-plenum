// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { GroupNameForm } from "@/components/board/group-name-form";
import { GroupingBoard } from "@/components/board/grouping-board";
import { FormDialog } from "@/components/members/form-dialog";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { usePhaseEdit } from "@/components/status/phase-banner";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import { refusalMessage } from "@/lib/i18n/refusals";
import {
  addElementGroupFn,
  askGroupCheckFn,
  moveElementFn,
  renameElementGroupFn,
} from "@/server/elements/functions";
import { elementKeys, groupingBoardQueryOptions } from "@/server/elements/query-options";
import { projectKeys } from "@/server/projects/query-options";

/**
 * Group the elements (EL18, EL24, ADR 0020): the facilitator corrects where each element starts,
 * by drag and drop or "Move here", renames and adds groups, and asks the participants to check.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/grouping")({
  beforeLoad: requireStep("grouping"),
  loader: async ({ context, params }) => {
    const board = await context.queryClient.ensureQueryData(
      groupingBoardQueryOptions(params.projectId),
    );
    if (!board.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.board_grouping_title()) }],
  }),
  component: Grouping,
});

function AskCheck({
  ask,
  onAsked,
}: Readonly<{
  ask: () => Promise<{ ok: boolean; error?: string }>;
  onAsked: () => Promise<void>;
}>) {
  const [pending, setPending] = useState(false);
  return (
    <Button
      type="button"
      disabled={pending}
      aria-busy={pending}
      onClick={async () => {
        setPending(true);
        try {
          const outcome = await ask();
          if (outcome.ok) {
            toast.success(m.board_grouping_asked());
            await onAsked();
          } else {
            toast.error(refusalMessage(outcome.error ?? ""));
          }
        } catch {
          toast.error(m.common_error_unexpected());
        } finally {
          setPending(false);
        }
      }}
    >
      {m.board_grouping_ask()}
    </Button>
  );
}

function Grouping() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const { project } = Route.useRouteContext();
  const { editable, banner } = usePhaseEdit(project.role, project.phase, "grouping");
  const { data: board } = useSuspenseQuery(groupingBoardQueryOptions(projectId));
  const move = useServerFn(moveElementFn);
  const rename = useServerFn(renameElementGroupFn);
  const add = useServerFn(addElementGroupFn);
  const ask = useServerFn(askGroupCheckFn);
  if (!board.ok) return <NotFoundState />;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: elementKeys.groups(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) }),
    ]);
  };

  return (
    <>
      <PageHeader
        level={2}
        title={m.board_grouping_title()}
        description={m.board_grouping_purpose()}
        actions={
          editable && (
            <FormDialog
              title={m.board_grouping_add()}
              description={m.board_grouping_add_description()}
              trigger={
                <Button type="button" variant="outline">
                  <PlusIcon aria-hidden="true" data-icon="inline-start" />
                  {m.board_grouping_add()}
                </Button>
              }
            >
              {({ close, cancel }) => (
                <GroupNameForm
                  initial=""
                  submitLabel={m.board_grouping_add()}
                  save={(name) => add({ data: { projectId, name } })}
                  cancel={cancel}
                  onSaved={async (name) => {
                    close();
                    toast.success(m.board_grouping_added({ name }));
                    await refresh();
                  }}
                />
              )}
            </FormDialog>
          )
        }
      />
      {banner}
      <GroupingBoard
        board={board.value}
        actions={{
          move: (elementId, groupId) => move({ data: { projectId, elementId, groupId } }),
          rename: (groupId, name) => rename({ data: { projectId, groupId, name } }),
          onChanged: refresh,
        }}
      />
      <div className="sticky bottom-0 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-lg">
        <span className="text-sm text-muted-foreground">
          {board.value.checkAskedAt === null
            ? m.board_grouping_rounds_note()
            : m.board_grouping_checking({
                checked: board.value.checked,
                participants: board.value.participants,
              })}
        </span>
        {editable && board.value.checkAskedAt === null && (
          <AskCheck ask={() => ask({ data: { projectId } })} onAsked={refresh} />
        )}
      </div>
    </>
  );
}
