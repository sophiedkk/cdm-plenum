// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { LibraryIcon } from "lucide-react";
import { FirstLookCard } from "@/components/board/first-look-card";
import { projectTitle } from "@/components/projects/project-title";
import { EmptyState, NotFoundState, PageHeader } from "@/components/shell/route-states";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import { writeOpen } from "@/lib/phase-access";
import { answerFirstLookFn } from "@/server/elements/functions";
import { elementKeys, firstLookQueryOptions } from "@/server/elements/query-options";
import { projectKeys } from "@/server/projects/query-options";

/**
 * The first look (EL22, ADR 0020): a participant goes through the elements from existing models
 * one at a time and says whether each belongs to the concept. The answers are their own; the
 * facilitator sees counts only (EL2).
 */
export const Route = createFileRoute("/_authed/projects/$projectId/first-look")({
  beforeLoad: requireStep("first_look"),
  loader: async ({ context, params }) => {
    const look = await context.queryClient.ensureQueryData(firstLookQueryOptions(params.projectId));
    if (!look.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.board_first_look_title()) }],
  }),
  component: FirstLookPage,
});

function FirstLookPage() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: look } = useSuspenseQuery(firstLookQueryOptions(projectId));
  const answer = useServerFn(answerFirstLookFn);
  if (!look.ok) return <NotFoundState />;

  return (
    <>
      <PageHeader
        level={2}
        title={m.board_first_look_title()}
        description={m.board_first_look_purpose({ concept: look.value.concept })}
      />
      {look.value.elements.length === 0 ? (
        <EmptyState
          icon={<LibraryIcon aria-hidden="true" />}
          title={m.board_first_look_empty_title()}
          description={m.board_first_look_empty()}
        >
          <Button asChild>
            <Link to="/projects/$projectId/brainstorm" params={{ projectId }}>
              {m.board_first_look_then_add()}
            </Link>
          </Button>
        </EmptyState>
      ) : (
        <FirstLookCard
          projectId={projectId}
          look={look.value}
          canAnswer={writeOpen(project.role, project.phase, "first_look_answer")}
          answer={async (elementId, value) => {
            const outcome = await answer({ data: { projectId, elementId, answer: value } });
            if (outcome.ok) {
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: elementKeys.firstLook(projectId) }),
                queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) }),
              ]);
            }
            return outcome;
          }}
        />
      )}
    </>
  );
}
