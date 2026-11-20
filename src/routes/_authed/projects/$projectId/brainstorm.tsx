// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import { type HintElement, QuickAddForm } from "@/components/board/quick-add-form";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { ELEMENT_PROMPTS, isPrivateStep } from "@/lib/brainstorm";
import { requireStep } from "@/lib/guards";
import { promptLabel, promptQuestion } from "@/lib/i18n/labels";
import { MARK_PHASE, writeOpen } from "@/lib/phase-access";
import { addElementFn, setSupportFn } from "@/server/elements/functions";
import type { BoardElement } from "@/server/elements/queries";
import {
  boardQueryOptions,
  elementKeys,
  ownElementsQueryOptions,
} from "@/server/elements/query-options";
import { projectKeys, projectQueryOptions } from "@/server/projects/query-options";

/**
 * The brainstorm (EL13 to EL15, ADR 0012, ADR 0018): one quick-add form with a choice of the four
 * questions in clinicians' words, and the member's own elements below, grouped by question. Data
 * type, cardinality, sources and values stay on the board. Similar names show only after the
 * reveal, from the board the member may read.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/brainstorm")({
  beforeLoad: requireStep("brainstorm"),
  loader: async ({ context, params }) => {
    const own = await context.queryClient.ensureQueryData(
      ownElementsQueryOptions(params.projectId),
    );
    if (!own.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.board_brainstorm_title()) }],
  }),
  component: Brainstorm,
});

function DetailsLink({
  projectId,
  element,
}: Readonly<{ projectId: string; element: HintElement }>) {
  return (
    <Link
      to="/projects/$projectId/board"
      params={{ projectId }}
      search={{ element: element.id }}
      aria-label={m.board_brainstorm_details_label({ name: element.name })}
      className="text-sm underline underline-offset-4"
    >
      {m.board_brainstorm_details()}
    </Link>
  );
}

function OwnElements({
  projectId,
  elements,
}: Readonly<{ projectId: string; elements: readonly BoardElement[] }>) {
  const groups = [...ELEMENT_PROMPTS, null]
    .map((prompt) => ({
      prompt,
      elements: elements.filter((element) => element.prompt === prompt),
    }))
    .filter((group) => group.elements.length > 0);
  return (
    <section aria-labelledby="own-elements-title" className="flex flex-col gap-4">
      <h3 id="own-elements-title" className="text-lg font-semibold">
        {m.board_brainstorm_yours({ count: elements.length })}
      </h3>
      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.board_brainstorm_none_yet()}</p>
      ) : (
        groups.map((group) => (
          <OwnGroup
            key={group.prompt ?? "other"}
            projectId={projectId}
            label={group.prompt === null ? promptLabel(null) : promptQuestion(group.prompt)}
            elements={group.elements}
          />
        ))
      )}
    </section>
  );
}

function OwnGroup({
  projectId,
  label,
  elements,
}: Readonly<{ projectId: string; label: string; elements: readonly BoardElement[] }>) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <h4 id={id} className="text-sm font-medium text-muted-foreground">
        {label}
      </h4>
      <ul aria-labelledby={id} className="flex flex-col gap-1">
        {elements.map((element) => (
          <li key={element.id} className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-medium">{element.name}</span>
            {element.description !== "" && (
              <span className="text-sm text-muted-foreground">{element.description}</span>
            )}
            <DetailsLink projectId={projectId} element={element} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Brainstorm() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: detail } = useSuspenseQuery(projectQueryOptions(projectId));
  const { data: own } = useSuspenseQuery(ownElementsQueryOptions(projectId));
  const shared = detail.ok && !isPrivateStep(detail.value);
  const isFacilitator = detail.ok && detail.value.role === "facilitator";
  // NOTE: EL15. Before the reveal the board is not even asked for, so no hint can name the
  // element of another participant.
  const board = useQuery({ ...boardQueryOptions(projectId, isFacilitator), enabled: shared });
  const addElement = useServerFn(addElementFn);
  const setSupport = useServerFn(setSupportFn);
  if (!detail.ok || !own.ok) return <NotFoundState />;

  const hintSource = shared ? (board.data?.ok ? board.data.value : []) : null;
  // NOTE: EL15, EL16. A hint marks the element on the board instead of adding a duplicate, once
  // marks are open: after the reveal, in the discover phase. The server checks it again.
  const role = detail.value.role;
  const phase = detail.value.phase;
  const canMark = shared && phase === MARK_PHASE && writeOpen(role, phase, "element_mark");

  return (
    <>
      <PageHeader
        level={2}
        title={m.board_brainstorm_title()}
        description={m.board_brainstorm_purpose()}
      />
      <p className="-mt-3 mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        {shared ? (
          <EyeIcon aria-hidden="true" className="size-4 shrink-0" />
        ) : (
          <EyeOffIcon aria-hidden="true" className="size-4 shrink-0" />
        )}
        {shared ? m.board_brainstorm_shared_note() : m.board_brainstorm_private_note()}
      </p>
      <div className="flex max-w-4xl flex-col gap-8">
        <QuickAddForm
          label={m.board_brainstorm_add_title()}
          hintSource={hintSource}
          hintLink={(element) => (
            <Link
              to="/projects/$projectId/board"
              params={{ projectId }}
              search={{ element: element.id }}
              className="underline underline-offset-4"
            >
              {element.name}
            </Link>
          )}
          submit={(fields) => addElement({ data: { projectId, ...fields } })}
          markSame={
            canMark
              ? (element) =>
                  setSupport({ data: { projectId, elementId: element.id, supported: true } })
              : undefined
          }
          onMarkedSame={async (element) => {
            await queryClient.invalidateQueries({ queryKey: elementKeys.marks(projectId) });
            toast.success(m.board_hints_marked_same({ name: element.name }));
          }}
          onAdded={async (name) => {
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: elementKeys.all(projectId) }),
              queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) }),
            ]);
            toast.success(m.board_added({ name }));
          }}
        />
        <OwnElements projectId={projectId} elements={own.value} />
      </div>
    </>
  );
}
