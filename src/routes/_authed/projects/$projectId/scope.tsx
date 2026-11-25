// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PencilIcon, PlusIcon } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CommentThread } from "@/components/comments/comment-thread";
import { FormDialog } from "@/components/members/form-dialog";
import { projectTitle } from "@/components/projects/project-title";
import { TaskBar } from "@/components/projects/task-bar";
import { ModelTypeForm, ModelTypeView } from "@/components/scope/model-type";
import { AddSourceForm, ScopeSourceList } from "@/components/scope/scope-sources";
import { ScopeStatementForm, ScopeStatementView } from "@/components/scope/scope-statement";
import { PageHeader } from "@/components/shell/route-states";
import { usePhaseEdit } from "@/components/status/phase-banner";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { refusalMessage } from "@/lib/i18n/refusals";
import { modelTypeOpen } from "@/lib/model-types";
import { writeOpen } from "@/lib/phase-access";
import { UNDO_MS } from "@/lib/undo";
import { projectKeys } from "@/server/projects/query-options";
import {
  addScopeCommentFn,
  addScopeSourceFn,
  removeScopeSourceFn,
  reorderScopeSourcesFn,
  restoreScopeSourceFn,
  setModelTypeFn,
  updateScopeFn,
} from "@/server/scope/functions";
import type { ScopeSource } from "@/server/scope/queries";
import {
  scopeCommentsQueryOptions,
  scopeKeys,
  scopeQueryOptions,
} from "@/server/scope/query-options";
import { COMMENT_MAX } from "@/server/scope/schemas";

/** The scope statement of the project (SC1, SC2). */
export const Route = createFileRoute("/_authed/projects/$projectId/scope")({
  loader: async ({ context, params }) => {
    const isFacilitator = context.project.role === "facilitator";
    const [scope, comments] = await Promise.all([
      context.queryClient.ensureQueryData(scopeQueryOptions(params.projectId)),
      context.queryClient.ensureQueryData(
        scopeCommentsQueryOptions(params.projectId, isFacilitator),
      ),
    ]);
    if (!scope.ok || !comments.ok) throw notFound();
  },
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.scope_title()) }] }),
  component: Scope,
});

const SECTION_HEADING = "text-lg font-semibold outline-none";

function Scope() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const isFacilitator = project.role === "facilitator";
  // A participant comments in the scope phase only; the server checks it again (PR9).
  const canComment = writeOpen(project.role, project.phase, "scope_comment");
  // The facilitator chooses the type until discover ends; the server checks it again (SC4).
  const { editable, banner } = usePhaseEdit(project.role, project.phase, "scope");
  const canSetType = isFacilitator && modelTypeOpen(project.phase);
  const canEdit = isFacilitator && editable;
  const queryClient = useQueryClient();
  const { data: scope } = useSuspenseQuery(scopeQueryOptions(projectId));
  const { data: comments } = useSuspenseQuery(scopeCommentsQueryOptions(projectId, isFacilitator));
  const [editing, setEditing] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const sourcesHeading = useRef<HTMLHeadingElement>(null);

  const updateScope = useServerFn(updateScopeFn);
  const addSource = useServerFn(addScopeSourceFn);
  const reorderSources = useServerFn(reorderScopeSourcesFn);
  const removeSource = useServerFn(removeScopeSourceFn);
  const restoreSource = useServerFn(restoreScopeSourceFn);
  const addComment = useServerFn(addScopeCommentFn);
  const setModelType = useServerFn(setModelTypeFn);

  if (!scope.ok || !comments.ok) return null;
  const statement = scope.value;
  const refreshScope = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: scopeKeys.statement(projectId) }),
      // The header shows one line of the scope (PR11).
      queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) }),
    ]);

  const stopEditing = () => {
    setEditing(false);
    requestAnimationFrame(() => editButton.current?.focus());
  };

  async function move(sourceId: string, direction: -1 | 1) {
    const order = statement.sources.map((source) => source.id);
    const from = order.indexOf(sourceId);
    const to = from + direction;
    if (from === -1 || to < 0 || to >= order.length) return;
    order.splice(from, 1);
    order.splice(to, 0, sourceId);
    const byId = new Map(statement.sources.map((source) => [source.id, source]));
    // Shows the new order at once, so focus can follow the moved source.
    queryClient.setQueryData(scopeQueryOptions(projectId).queryKey, (old) =>
      old?.ok
        ? {
            ...old,
            value: {
              ...old.value,
              sources: order.map((id) => byId.get(id)).filter((s): s is ScopeSource => !!s),
            },
          }
        : old,
    );
    try {
      const result = await reorderSources({ data: { projectId, sourceIds: order } });
      if (result.ok) {
        const label = byId.get(sourceId)?.label ?? "";
        toast.success(m.scope_source_moved({ label, position: to + 1 }));
      } else {
        toast.error(refusalMessage(result.error));
      }
    } catch {
      toast.error(m.common_error_unexpected());
    }
    await refreshScope();
  }

  async function undoRemove(source: ScopeSource, position: number) {
    try {
      const result = await restoreSource({
        data: { projectId, label: source.label, url: source.url, position },
      });
      if (result.ok) toast.success(m.scope_source_restored({ label: source.label }));
      else toast.error(refusalMessage(result.error));
    } catch {
      toast.error(m.common_error_unexpected());
    }
    await refreshScope();
  }

  async function remove(source: ScopeSource) {
    const position = statement.sources.findIndex((candidate) => candidate.id === source.id);
    try {
      const result = await removeSource({ data: { projectId, sourceId: source.id } });
      if (result.ok) {
        toast.success(m.scope_source_removed({ label: source.label }), {
          duration: UNDO_MS,
          action: { label: m.common_undo(), onClick: () => void undoRemove(source, position) },
        });
      } else {
        toast.error(refusalMessage(result.error));
      }
    } catch {
      toast.error(m.common_error_unexpected());
    }
    await refreshScope();
    // The removed source's buttons are gone; the list's heading takes the focus.
    requestAnimationFrame(() => sourcesHeading.current?.focus());
  }

  // The task is to read and comment, so the bar shows only while a participant may comment.
  const bar = !isFacilitator && canComment;

  return (
    <>
      <PageHeader
        level={2}
        title={m.scope_title()}
        description={bar ? undefined : m.scope_purpose()}
      />
      {banner}
      {bar && <TaskBar projectId={projectId} sentence={m.projects_task_scope()} />}
      <div className="flex max-w-3xl flex-col gap-10">
        <section aria-labelledby="scope-statement" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="scope-statement" className={SECTION_HEADING}>
              {m.scope_statement_heading()}
            </h3>
            {canEdit && !editing && (
              <Button
                ref={editButton}
                type="button"
                variant="outline"
                onClick={() => {
                  setEditing(true);
                  // The button leaves with the form's arrival; the first field takes the focus.
                  requestAnimationFrame(() =>
                    document.querySelector<HTMLElement>("#scope-statement-form textarea")?.focus(),
                  );
                }}
              >
                <PencilIcon aria-hidden="true" data-icon="inline-start" />
                {m.scope_edit()}
              </Button>
            )}
          </div>
          {editing ? (
            <ScopeStatementForm
              id="scope-statement-form"
              texts={statement}
              save={(texts) => updateScope({ data: { projectId, ...texts } })}
              onSaved={async () => {
                await refreshScope();
                toast.success(m.scope_saved());
                stopEditing();
              }}
              actions={
                <Button type="button" variant="outline" onClick={stopEditing}>
                  {m.common_cancel()}
                </Button>
              }
            />
          ) : (
            <ScopeStatementView texts={statement} />
          )}
        </section>

        <section aria-labelledby="scope-model-type" className="flex flex-col gap-4">
          <h3 id="scope-model-type" className={SECTION_HEADING}>
            {m.scope_model_type_heading()}
          </h3>
          {canSetType ? (
            <ModelTypeForm
              key={statement.modelType ?? "none"}
              type={statement.modelType}
              save={(modelType) => setModelType({ data: { projectId, modelType } })}
              onSaved={async () => {
                await Promise.all([
                  refreshScope(),
                  // The questions and group names on every page follow the type.
                  queryClient.invalidateQueries({
                    queryKey: projectKeys.detail(projectId),
                    exact: true,
                  }),
                ]);
                toast.success(m.scope_model_type_saved());
              }}
            />
          ) : (
            <ModelTypeView type={statement.modelType} />
          )}
        </section>

        <section aria-labelledby="scope-sources" className="flex flex-col gap-4">
          <h3 id="scope-sources" ref={sourcesHeading} tabIndex={-1} className={SECTION_HEADING}>
            {m.scope_sources_heading()}
          </h3>
          <ScopeSourceList
            sources={statement.sources}
            editable={canEdit}
            move={move}
            remove={remove}
          />
          {canEdit && (
            <div>
              <FormDialog
                title={m.scope_source_add_title()}
                trigger={
                  <Button type="button" variant="outline">
                    <PlusIcon aria-hidden="true" data-icon="inline-start" />
                    {m.scope_source_add()}
                  </Button>
                }
              >
                {({ close, cancel }) => (
                  <AddSourceForm
                    close={close}
                    cancel={cancel}
                    add={(source) => addSource({ data: { projectId, ...source } })}
                    onAdded={async (label) => {
                      await refreshScope();
                      toast.success(m.scope_source_added({ label }));
                    }}
                  />
                )}
              </FormDialog>
            </div>
          )}
        </section>

        <section aria-labelledby="scope-comments" className="flex flex-col gap-4">
          <h3 id="scope-comments" className={SECTION_HEADING}>
            {m.scope_comments_heading()}
          </h3>
          <CommentThread
            comments={comments.value}
            max={COMMENT_MAX}
            label={m.scope_comments_heading()}
            add={canComment ? (body) => addComment({ data: { projectId, body } }) : undefined}
            onAdded={async () => {
              await queryClient.invalidateQueries({ queryKey: scopeKeys.comments(projectId) });
              toast.success(m.common_comment_added());
            }}
          />
        </section>
      </div>
    </>
  );
}
