// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ChevronRightIcon } from "lucide-react";
import { DetailCard } from "@/components/details/detail-card";
import { DetailsBack } from "@/components/details/details-back";
import { useDetailActions } from "@/components/details/use-detail-actions";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { StepClosedNote } from "@/components/status/step-closed-note";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { listRows, nextToAnswer } from "@/lib/detail-list";
import { detailBoardQueryOptions } from "@/server/details/query-options";

/** One element of the model on its own page: its structure, codes, answers and settling. */
export const Route = createFileRoute("/_authed/projects/$projectId/details/$elementId")({
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.details_title()) }],
  }),
  component: ElementPage,
});

function ElementPage() {
  const { projectId, elementId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const { data: board } = useSuspenseQuery(detailBoardQueryOptions(projectId));
  const { actions } = useDetailActions(projectId);
  if (!board.ok) {
    if (board.error === "not_found") throw notFound();
    return <NotFoundState />;
  }
  const facilitator = project.role === "facilitator";
  const element = board.value.elements.find((candidate) => candidate.id === elementId);
  if (!element) return <NotFoundState />;
  const { mayPropose, mayProposeCodes, mayReview, mayAnswer, open, valueRounds, modeller } =
    board.value;
  const next = mayAnswer
    ? nextToAnswer(listRows(board.value.elements, { facilitator, ...board.value }), elementId)
    : null;
  return (
    <>
      <DetailsBack projectId={projectId} />
      <PageHeader level={2} title={element.name} />
      {!open && !facilitator && <StepClosedNote className="mb-4" />}
      <div className="flex flex-col gap-4">
        <DetailCard
          standalone
          element={element}
          mayPropose={mayPropose}
          mayProposeCodes={mayProposeCodes}
          mayReview={mayReview}
          mayAnswer={mayAnswer}
          facilitator={facilitator}
          open={open}
          actions={actions}
          projectId={projectId}
          valueRounds={valueRounds}
          modeller={modeller}
        />
        {next !== null && (
          <div>
            <Button asChild variant="outline">
              <Link
                to="/projects/$projectId/details/$elementId"
                params={{ projectId, elementId: next }}
              >
                {m.details_next()}
                <ChevronRightIcon aria-hidden="true" data-icon="inline-end" />
              </Link>
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
