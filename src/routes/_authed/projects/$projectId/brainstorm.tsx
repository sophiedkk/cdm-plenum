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
import { ELEMENT_PROMPTS, type ElementPrompt, isPrivateStep } from "@/lib/brainstorm";
import { promptQuestion } from "@/lib/i18n/labels";
import { addElementFn } from "@/server/elements/functions";
import type { BoardElement } from "@/server/elements/queries";
import {
  boardQueryOptions,
  elementKeys,
  ownElementsQueryOptions,
} from "@/server/elements/query-options";
import { projectQueryOptions } from "@/server/projects/query-options";
import { scopeQueryOptions } from "@/server/scope/query-options";

/**
 * The brainstorm (EL13 to EL15, ADR 0012): four questions in clinicians' words, each with a
 * quick-add form and the member's own answers. Data type, cardinality, sources and values stay
 * on the board. Similar names show only after the reveal, from the board the member may read.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/brainstorm")({
  loader: async ({ context, params }) => {
    const [own, scope] = await Promise.all([
      context.queryClient.ensureQueryData(ownElementsQueryOptions(params.projectId)),
      context.queryClient.ensureQueryData(scopeQueryOptions(params.projectId)),
    ]);
    if (!own.ok || !scope.ok) throw notFound();
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
  label,
  elements,
}: Readonly<{ projectId: string; label: string; elements: readonly BoardElement[] }>) {
  const id = useId();
  if (elements.length === 0) return null;
  return (
    <div className="flex flex-col gap-1">
      <p id={id} className="text-sm text-muted-foreground">
        {label}
      </p>
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
  const { data: scope } = useSuspenseQuery(scopeQueryOptions(projectId));
  const shared = detail.ok && !isPrivateStep(detail.value);
  const isFacilitator = detail.ok && detail.value.role === "facilitator";
  // NOTE: EL15. Before the reveal the board is not even asked for, so no hint can name the
  // element of another participant.
  const board = useQuery({ ...boardQueryOptions(projectId, isFacilitator), enabled: shared });
  const addElement = useServerFn(addElementFn);
  if (!detail.ok || !own.ok || !scope.ok) return <NotFoundState />;

  const hintSource = shared ? (board.data?.ok ? board.data.value : []) : null;
  const byPrompt = (prompt: ElementPrompt | null) =>
    own.value.filter((element) => element.prompt === prompt);
  const concept = scope.value.concept.trim();

  return (
    <>
      <PageHeader
        level={2}
        title={m.board_brainstorm_title()}
        description={m.board_brainstorm_purpose()}
      />
      <div className="mb-6 flex flex-col gap-2">
        <p className="truncate" data-testid="brainstorm-concept">
          {concept === ""
            ? m.board_brainstorm_concept_missing()
            : m.board_brainstorm_concept({ concept })}
        </p>
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          {shared ? (
            <EyeIcon aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <EyeOffIcon aria-hidden="true" className="size-4 shrink-0" />
          )}
          {shared ? m.board_brainstorm_shared_note() : m.board_brainstorm_private_note()}
        </p>
      </div>
      <div className="flex flex-col gap-6">
        {ELEMENT_PROMPTS.map((prompt) => (
          <QuickAddForm
            key={prompt}
            question={promptQuestion(prompt)}
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
            submit={(fields) => addElement({ data: { projectId, ...fields, prompt } })}
            onAdded={async (name) => {
              await queryClient.invalidateQueries({ queryKey: elementKeys.all(projectId) });
              toast.success(m.board_added({ name }));
            }}
          >
            <OwnElements
              projectId={projectId}
              label={m.board_brainstorm_yours()}
              elements={byPrompt(prompt)}
            />
          </QuickAddForm>
        ))}
        <OwnElements
          projectId={projectId}
          label={m.board_brainstorm_other()}
          elements={byPrompt(null)}
        />
      </div>
    </>
  );
}
