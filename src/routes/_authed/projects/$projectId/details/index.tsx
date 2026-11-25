// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { RulerIcon } from "lucide-react";
import { DetailsList } from "@/components/details/details-list";
import { projectTitle } from "@/components/projects/project-title";
import { TaskBar } from "@/components/projects/task-bar";
import { EmptyState, NotFoundState, PageHeader } from "@/components/shell/route-states";
import { StepClosedNote } from "@/components/status/step-closed-note";
import { m } from "@/i18n/messages";
import { detailStepProgress } from "@/lib/task-progress";
import { detailBoardQueryOptions, treeBoardQueryOptions } from "@/server/details/query-options";
import { projectOverviewQueryOptions } from "@/server/projects/query-options";

/** The list of the elements in the model and the tree, one row each (DT1 to DT6). */
export const Route = createFileRoute("/_authed/projects/$projectId/details/")({
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.details_title()) }],
  }),
  component: DetailsListPage,
});

function DetailsListPage() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const { data: board } = useSuspenseQuery(detailBoardQueryOptions(projectId));
  const { data: tree } = useSuspenseQuery(treeBoardQueryOptions(projectId));
  const { data: overview } = useSuspenseQuery(projectOverviewQueryOptions(projectId));

  if (!board.ok) {
    if (board.error === "not_found") throw notFound();
    return <NotFoundState />;
  }
  const facilitator = project.role === "facilitator";
  const { elements, open } = board.value;

  const bar =
    !facilitator && open && overview.ok ? detailStepProgress(overview.value.detail) : null;
  const progress = bar
    ? [
        ...(bar.progress
          ? [m.projects_bar_answered({ done: bar.progress.done, total: bar.progress.total })]
          : []),
        ...(bar.toPropose > 0 ? [m.projects_bar_to_propose({ count: bar.toPropose })] : []),
        ...(bar.toProposeCodes > 0
          ? [m.projects_bar_to_propose_codes({ count: bar.toProposeCodes })]
          : []),
        ...(bar.toReview > 0 ? [m.projects_bar_to_review({ count: bar.toReview })] : []),
      ]
    : [];

  return (
    <>
      <PageHeader level={2} title={m.details_title()} />
      {bar && (
        <TaskBar
          projectId={projectId}
          sentence={m.projects_bar_detail()}
          progress={progress}
          done={bar.done ? { next: m.projects_bar_detail_done() } : null}
        />
      )}
      {!open && !facilitator && <StepClosedNote className="mb-4" />}
      {elements.length === 0 ? (
        <EmptyState
          icon={<RulerIcon aria-hidden="true" />}
          title={m.details_empty_title()}
          description={m.details_empty()}
        />
      ) : (
        <DetailsList
          projectId={projectId}
          board={board.value}
          tree={tree.ok ? tree.value : null}
          facilitator={facilitator}
        />
      )}
    </>
  );
}
