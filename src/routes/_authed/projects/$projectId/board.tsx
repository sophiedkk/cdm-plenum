// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  ChevronDownIcon,
  CombineIcon,
  FileUpIcon,
  LayoutGridIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { BoardDialog } from "@/components/board/board-dialog";
import {
  PrivateStepNote,
  PrivateStepStatus,
  RevealButton,
} from "@/components/board/brainstorm-panel";
import { CkmPanel } from "@/components/board/ckm-panel";
import type { CardElement } from "@/components/board/element-details";
import { ElementForm } from "@/components/board/element-form";
import { ElementTable } from "@/components/board/element-table";
import { MergeForm } from "@/components/board/merge-form";
import { ValuesForm } from "@/components/board/values-form";
import { projectTitle } from "@/components/projects/project-title";
import { EmptyState, PageHeader } from "@/components/shell/route-states";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { m } from "@/i18n/messages";
import { isPrivateStep } from "@/lib/brainstorm";
import { dataTypeByKey } from "@/lib/data-types";
import { importArchetypeFn, linkElementFn, searchCkmFn } from "@/server/ckm/functions";
import {
  addElementCommentFn,
  addElementFn,
  mergeElementsFn,
  revealBoardFn,
  setElementValuesFn,
  updateElementFn,
} from "@/server/elements/functions";
import {
  boardQueryOptions,
  brainstormStatusQueryOptions,
  elementKeys,
} from "@/server/elements/query-options";
import { projectKeys, projectQueryOptions } from "@/server/projects/query-options";

/**
 * The element board of the project (EL1 to EL7, EL9). In the private step of the brainstorm the
 * facilitator follows it and reveals the board here (EL13). `element` opens that element's row.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/board")({
  validateSearch: z.object({ element: z.string().max(64).optional() }),
  loader: async ({ context, params }) => {
    const isFacilitator = context.project.role === "facilitator";
    const board = await context.queryClient.ensureQueryData(
      boardQueryOptions(params.projectId, isFacilitator),
    );
    if (!board.ok) throw notFound();
  },
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.board_title()) }] }),
  component: Board,
});

type DialogState =
  | { kind: "add" }
  | { kind: "edit"; element: CardElement }
  | { kind: "values"; element: CardElement }
  | { kind: "merge" }
  | { kind: "ckm"; target: CardElement | null }
  | null;

function Board() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const isFacilitator = project.role === "facilitator";
  const queryClient = useQueryClient();
  const { element: openElementId } = Route.useSearch();
  const { data: board } = useSuspenseQuery(boardQueryOptions(projectId, isFacilitator));
  const { data: detail } = useSuspenseQuery(projectQueryOptions(projectId));
  const privateStep = detail.ok && isPrivateStep(detail.value);
  const { data: status } = useQuery({
    ...brainstormStatusQueryOptions(projectId),
    enabled: isFacilitator && privateStep,
  });
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogState>(null);

  const addElement = useServerFn(addElementFn);
  const updateElement = useServerFn(updateElementFn);
  const setValues = useServerFn(setElementValuesFn);
  const mergeElements = useServerFn(mergeElementsFn);
  const addComment = useServerFn(addElementCommentFn);
  const searchCkm = useServerFn(searchCkmFn);
  const linkElement = useServerFn(linkElementFn);
  const importArchetype = useServerFn(importArchetypeFn);
  const revealBoard = useServerFn(revealBoardFn);

  if (!board.ok) return null;
  const elements = board.value;
  const refreshBoard = () =>
    Promise.all(
      [elementKeys.board, elementKeys.own, elementKeys.brainstorm].map((key) =>
        queryClient.invalidateQueries({ queryKey: key(projectId) }),
      ),
    );
  const close = () => setDialog(null);
  const cancel = (
    <Button type="button" variant="outline" onClick={close}>
      {m.common_cancel()}
    </Button>
  );

  const addButton = (
    <Button type="button" onClick={() => setDialog({ kind: "add" })}>
      <PlusIcon aria-hidden="true" data-icon="inline-start" />
      {m.board_add()}
    </Button>
  );

  return (
    <>
      <PageHeader
        level={2}
        title={m.board_title()}
        description={m.board_purpose()}
        actions={
          <>
            {addButton}
            {isFacilitator && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialog({ kind: "ckm", target: null })}
                >
                  <SearchIcon aria-hidden="true" data-icon="inline-start" />
                  {m.board_ckm_search()}
                </Button>
                <DropdownMenu modal={false}>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline">
                      {m.board_more_actions()}
                      <ChevronDownIcon aria-hidden="true" data-icon="inline-end" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-auto">
                    <DropdownMenuItem
                      disabled={elements.length < 2}
                      onSelect={() => setDialog({ kind: "merge" })}
                    >
                      <CombineIcon aria-hidden="true" />
                      {m.board_merge()}
                    </DropdownMenuItem>
                    <DropdownMenuItem asChild>
                      <Link to="/projects/$projectId/board/import" params={{ projectId }}>
                        <FileUpIcon aria-hidden="true" />
                        {m.board_import_link()}
                      </Link>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
          </>
        }
      />

      {privateStep && !isFacilitator && <PrivateStepNote />}
      {privateStep && isFacilitator && status?.ok && (
        <PrivateStepStatus
          participants={status.value.participants}
          action={
            <RevealButton
              participants={status.value.participants}
              reveal={() => revealBoard({ data: { projectId } })}
              onRevealed={async () => {
                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
                  queryClient.invalidateQueries({ queryKey: elementKeys.all(projectId) }),
                ]);
                await router.invalidate();
              }}
            />
          }
        />
      )}

      {elements.length === 0 ? (
        <EmptyState
          icon={<LayoutGridIcon aria-hidden="true" />}
          title={m.board_empty_title()}
          description={m.board_empty_description()}
        />
      ) : (
        <ElementTable
          projectId={projectId}
          elements={elements}
          isFacilitator={isFacilitator}
          openElementId={openElementId}
          actions={{
            addComment: (element, body) =>
              addComment({ data: { projectId, elementId: element.id, body } }),
            onCommentAdded: async (element) => {
              await Promise.all([
                queryClient.invalidateQueries({
                  queryKey: elementKeys.comments(projectId, element.id),
                }),
                refreshBoard(),
              ]);
              toast.success(m.common_comment_added());
            },
            onEdit: (element) => setDialog({ kind: "edit", element }),
            onValues: (element) => setDialog({ kind: "values", element }),
            onLink: (element) => setDialog({ kind: "ckm", target: element }),
          }}
        />
      )}

      <BoardDialog
        open={dialog?.kind === "add"}
        onOpenChange={(open) => !open && close()}
        title={m.board_add_title()}
        description={m.board_add_description()}
      >
        <ElementForm
          withSource
          submitLabel={m.board_add()}
          submit={(fields) => addElement({ data: { projectId, ...fields } })}
          onDone={async (fields) => {
            await refreshBoard();
            toast.success(m.board_added({ name: fields.name }));
            close();
          }}
          actions={cancel}
        />
      </BoardDialog>

      <BoardDialog
        open={dialog?.kind === "edit"}
        onOpenChange={(open) => !open && close()}
        title={m.board_edit_title()}
        description={m.board_edit_description()}
      >
        {dialog?.kind === "edit" && (
          <ElementForm
            withSource={false}
            initial={dialog.element}
            submitLabel={m.board_save()}
            submit={(fields) =>
              updateElement({ data: { projectId, elementId: dialog.element.id, ...fields } })
            }
            onDone={async (fields) => {
              await refreshBoard();
              toast.success(m.board_saved({ name: fields.name }));
              close();
            }}
            actions={cancel}
          />
        )}
      </BoardDialog>

      <BoardDialog
        open={dialog?.kind === "values"}
        onOpenChange={(open) => !open && close()}
        title={m.board_values_title()}
        description={
          dialog?.kind === "values" && dialog.element.dataType !== null
            ? m.board_values_description({
                name: dialog.element.name,
                type: dataTypeByKey(dialog.element.dataType).rmType,
              })
            : ""
        }
      >
        {dialog?.kind === "values" && dialog.element.dataType !== null && (
          <ValuesForm
            dataType={dialog.element.dataType}
            initial={dialog.element.values}
            save={(values) =>
              setValues({ data: { projectId, elementId: dialog.element.id, values } })
            }
            onSaved={async () => {
              await refreshBoard();
              toast.success(m.board_values_saved({ name: dialog.element.name }));
              close();
            }}
            actions={cancel}
          />
        )}
      </BoardDialog>

      <BoardDialog
        open={dialog?.kind === "merge"}
        onOpenChange={(open) => !open && close()}
        title={m.board_merge_title()}
        description={m.board_merge_description()}
      >
        <MergeForm
          candidates={elements.map((element, index) => ({
            id: element.id,
            name: `${index + 1}. ${element.name}`,
          }))}
          merge={(intoId, fromIds) => mergeElements({ data: { projectId, intoId, fromIds } })}
          onMerged={async (into) => {
            await refreshBoard();
            toast.success(m.board_merged({ name: into.name }));
            close();
          }}
          actions={cancel}
        />
      </BoardDialog>

      <BoardDialog
        open={dialog?.kind === "ckm"}
        onOpenChange={(open) => !open && close()}
        wide
        title={
          dialog?.kind === "ckm" && dialog.target
            ? m.board_ckm_link_title({ name: dialog.target.name })
            : m.board_ckm_title()
        }
        description={
          dialog?.kind === "ckm" && dialog.target
            ? m.board_ckm_link_description()
            : m.board_ckm_description()
        }
      >
        {dialog?.kind === "ckm" && (
          <>
            <CkmPanel
              projectId={projectId}
              linkTarget={dialog.target}
              actions={{
                search: (text) => searchCkm({ data: { projectId, text } }),
                link: (archetype, element) =>
                  linkElement({
                    data: {
                      projectId,
                      elementId: dialog.target?.id ?? "",
                      cid: archetype.cid,
                      revision: archetype.revision,
                      path: element.path,
                    },
                  }),
                importAll: async (archetype) => {
                  const result = await importArchetype({
                    data: { projectId, cid: archetype.cid, revision: archetype.revision },
                  });
                  return result;
                },
              }}
              onDone={async (message) => {
                await refreshBoard();
                toast.success(message);
                close();
              }}
            />
            <div>
              <Button type="button" variant="outline" onClick={close}>
                {m.board_close()}
              </Button>
            </div>
          </>
        )}
      </BoardDialog>
    </>
  );
}
