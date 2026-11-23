// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RulerIcon } from "lucide-react";
import { type DetailActions, DetailCard } from "@/components/details/detail-card";
import { projectTitle } from "@/components/projects/project-title";
import { EmptyState, NotFoundState, PageHeader } from "@/components/shell/route-states";
import { StepClosedNote } from "@/components/status/step-closed-note";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import {
  addressObjectionFn,
  answerDetailFn,
  proposeDetailFn,
  settleDetailFn,
} from "@/server/details/functions";
import { detailBoardQueryOptions, detailKeys } from "@/server/details/query-options";
import { elementKeys } from "@/server/elements/query-options";
import { projectKeys } from "@/server/projects/query-options";

/**
 * The structure of the elements in the model (DT1, DT2, ADR 0017): a proposal per element, the
 * participants' consent and the facilitator's settling.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/details")({
  beforeLoad: requireStep("details"),
  loader: async ({ context, params }) => {
    await context.queryClient.ensureQueryData(detailBoardQueryOptions(params.projectId));
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.details_title()) }],
  }),
  component: DetailsPage,
});

function DetailsPage() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const { data: board } = useSuspenseQuery(detailBoardQueryOptions(projectId));
  const propose = useServerFn(proposeDetailFn);
  const answer = useServerFn(answerDetailFn);
  const address = useServerFn(addressObjectionFn);
  const settle = useServerFn(settleDetailFn);

  if (!board.ok) {
    if (board.error === "not_found") throw notFound();
    return <NotFoundState />;
  }
  const facilitator = project.role === "facilitator";
  const actions: DetailActions = {
    propose: (elementId, version, structure) =>
      propose({ data: { projectId, elementId, version, ...structure } }),
    answer: (proposalId, version, value, reason) =>
      answer({ data: { projectId, proposalId, version, answer: value, reason } }),
    address: (answerId, note) => address({ data: { projectId, answerId, note } }),
    settle: (proposalId, version) => settle({ data: { projectId, proposalId, version } }),
    onChanged: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKeys.all(projectId) }),
        queryClient.invalidateQueries({ queryKey: elementKeys.board(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) }),
      ]);
    },
  };
  const { elements, mayPropose, mayAnswer, open } = board.value;

  return (
    <>
      <PageHeader level={2} title={m.details_title()} />
      {!open && !facilitator && <StepClosedNote className="mb-4" />}
      {elements.length === 0 ? (
        <EmptyState
          icon={<RulerIcon aria-hidden="true" />}
          title={m.details_empty_title()}
          description={m.details_empty()}
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {elements.map((element) => (
            <DetailCard
              key={element.id}
              element={element}
              mayPropose={mayPropose}
              mayAnswer={mayAnswer}
              facilitator={facilitator}
              open={open}
              actions={actions}
            />
          ))}
        </ul>
      )}
    </>
  );
}
