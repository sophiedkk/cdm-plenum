// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RevealButton } from "@/components/board/brainstorm-panel";
import { BoardStrip, QuestionBoard } from "@/components/board/question-board";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { SuggestModelButton } from "@/components/sources/suggest-model";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import { MARK_PHASE, REVEAL_PHASE, writeOpen } from "@/lib/phase-access";
import { addElementFn, revealBoardFn, setSupportFn } from "@/server/elements/functions";
import {
  brainstormBoardQueryOptions,
  brainstormStatusQueryOptions,
  elementKeys,
} from "@/server/elements/query-options";
import { projectKeys, projectQueryOptions } from "@/server/projects/query-options";
import { suggestSourceFn } from "@/server/sources/functions";
import { sourceKeys } from "@/server/sources/query-options";

/**
 * The brainstorm board (EL13 to EL16, EL23, ADR 0020): one column per question, the elements
 * from existing models dashed, the member's own marked and, before the reveal, other people's
 * elements as a count per column. Enter in a column adds under its question. The server decides
 * what each member may see; similar names show only after the reveal.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/brainstorm")({
  beforeLoad: requireStep("brainstorm"),
  loader: async ({ context, params }) => {
    const board = await context.queryClient.ensureQueryData(
      brainstormBoardQueryOptions(params.projectId),
    );
    if (!board.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.board_brainstorm_title()) }],
  }),
  component: Brainstorm,
});

function Brainstorm() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { data: board } = useSuspenseQuery(brainstormBoardQueryOptions(projectId));
  const { data: detail } = useSuspenseQuery(projectQueryOptions(projectId));
  const isFacilitator = project.role === "facilitator";
  const revealDue =
    isFacilitator &&
    project.phase === REVEAL_PHASE &&
    detail.ok &&
    detail.value.privateBrainstorm &&
    !detail.value.boardRevealed;
  const { data: status } = useQuery({
    ...brainstormStatusQueryOptions(projectId),
    enabled: revealDue,
  });
  const addElement = useServerFn(addElementFn);
  const setSupport = useServerFn(setSupportFn);
  const reveal = useServerFn(revealBoardFn);
  const suggest = useServerFn(suggestSourceFn);
  if (!board.ok || !detail.ok) return <NotFoundState />;

  const canAdd = writeOpen(project.role, project.phase, "element_add");
  // NOTE: EL15, EL16. After the reveal a hint marks the element instead of adding a duplicate,
  // while marks are open in discover. The server checks it again.
  const canMark =
    !board.value.privateStep &&
    !(detail.value.privateBrainstorm && !detail.value.boardRevealed) &&
    project.phase === MARK_PHASE &&
    writeOpen(project.role, project.phase, "element_mark");
  const canSuggest = !isFacilitator && writeOpen(project.role, project.phase, "source_suggest");

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: elementKeys.all(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) }),
    ]);
  }

  return (
    <>
      <PageHeader
        level={2}
        title={m.board_brainstorm_title()}
        description={
          board.value.privateStep
            ? m.board_brainstorm_purpose_private()
            : m.board_brainstorm_purpose_shared()
        }
        actions={
          revealDue && status?.ok ? (
            <RevealButton
              participants={status.value.participants}
              reveal={() => reveal({ data: { projectId } })}
              onRevealed={async () => {
                await Promise.all([
                  refresh(),
                  queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
                ]);
                await router.invalidate();
              }}
            />
          ) : undefined
        }
      />
      <BoardStrip board={board.value} />
      <QuestionBoard
        board={board.value}
        canAdd={canAdd}
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
        actions={{
          add: (prompt, name, reference) =>
            addElement({ data: { projectId, name, description: "", prompt, reference } }),
          onAdded: async (name) => {
            await refresh();
            toast.success(m.board_added({ name }));
          },
          markSame: canMark
            ? (element) =>
                setSupport({ data: { projectId, elementId: element.id, supported: true } })
            : undefined,
          onMarkedSame: async (element) => {
            await queryClient.invalidateQueries({ queryKey: elementKeys.marks(projectId) });
            toast.success(m.board_hints_marked_same({ name: element.name }));
          },
        }}
      />
      {canSuggest && (
        <div className="mt-6">
          <SuggestModelButton
            suggest={(title, link) => suggest({ data: { projectId, title, link } })}
            onSuggested={async () => {
              await queryClient.invalidateQueries({ queryKey: sourceKeys.all(projectId) });
              toast.success(m.board_suggest_sent());
            }}
          />
        </div>
      )}
    </>
  );
}
