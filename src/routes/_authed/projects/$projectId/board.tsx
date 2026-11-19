// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { CombineIcon, FileUpIcon, LayoutGridIcon, PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BoardDialog } from "@/components/board/board-dialog";
import { CkmPanel } from "@/components/board/ckm-panel";
import { type CardElement, ElementCard } from "@/components/board/element-card";
import { ElementForm } from "@/components/board/element-form";
import { MergeForm } from "@/components/board/merge-form";
import { ValuesForm } from "@/components/board/values-form";
import { projectTitle } from "@/components/projects/project-title";
import { EmptyState, PageHeader } from "@/components/shell/route-states";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { dataTypeByKey } from "@/lib/data-types";
import { importArchetypeFn, linkElementFn, searchCkmFn } from "@/server/ckm/functions";
import {
  addElementCommentFn,
  addElementFn,
  mergeElementsFn,
  setElementValuesFn,
  updateElementFn,
} from "@/server/elements/functions";
import { boardQueryOptions, elementKeys } from "@/server/elements/query-options";

/** The element board of the project (EL1 to EL7, EL9). */
export const Route = createFileRoute("/_authed/projects/$projectId/board")({
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
  const { data: board } = useSuspenseQuery(boardQueryOptions(projectId, isFacilitator));
  const [dialog, setDialog] = useState<DialogState>(null);

  const addElement = useServerFn(addElementFn);
  const updateElement = useServerFn(updateElementFn);
  const setValues = useServerFn(setElementValuesFn);
  const mergeElements = useServerFn(mergeElementsFn);
  const addComment = useServerFn(addElementCommentFn);
  const searchCkm = useServerFn(searchCkmFn);
  const linkElement = useServerFn(linkElementFn);
  const importArchetype = useServerFn(importArchetypeFn);

  if (!board.ok) return null;
  const elements = board.value;
  const refreshBoard = () =>
    queryClient.invalidateQueries({ queryKey: elementKeys.board(projectId) });
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
                  disabled={elements.length < 2}
                  onClick={() => setDialog({ kind: "merge" })}
                >
                  <CombineIcon aria-hidden="true" data-icon="inline-start" />
                  {m.board_merge()}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDialog({ kind: "ckm", target: null })}
                >
                  <SearchIcon aria-hidden="true" data-icon="inline-start" />
                  {m.board_ckm_search()}
                </Button>
                <Button asChild variant="outline">
                  <Link to="/projects/$projectId/board/import" params={{ projectId }}>
                    <FileUpIcon aria-hidden="true" data-icon="inline-start" />
                    {m.board_import_link()}
                  </Link>
                </Button>
              </>
            )}
          </>
        }
      />

      {elements.length === 0 ? (
        <EmptyState
          icon={<LayoutGridIcon aria-hidden="true" />}
          title={m.board_empty_title()}
          description={m.board_empty_description()}
        />
      ) : (
        <ol aria-label={m.board_list_label()} className="flex flex-col gap-4">
          {elements.map((element, index) => (
            <li key={element.id}>
              <ElementCard
                projectId={projectId}
                element={element}
                position={index + 1}
                isFacilitator={isFacilitator}
                addComment={(body) =>
                  addComment({ data: { projectId, elementId: element.id, body } })
                }
                onCommentAdded={async () => {
                  await Promise.all([
                    queryClient.invalidateQueries({
                      queryKey: elementKeys.comments(projectId, element.id),
                    }),
                    refreshBoard(),
                  ]);
                  toast.success(m.common_comment_added());
                }}
                onEdit={() => setDialog({ kind: "edit", element })}
                onValues={() => setDialog({ kind: "values", element })}
                onLink={() => setDialog({ kind: "ckm", target: element })}
              />
            </li>
          ))}
        </ol>
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
