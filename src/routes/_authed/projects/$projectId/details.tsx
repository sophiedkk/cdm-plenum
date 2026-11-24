// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RulerIcon } from "lucide-react";
import { type DetailActions, DetailCard } from "@/components/details/detail-card";
import { TreeSection } from "@/components/details/tree-section";
import { projectTitle } from "@/components/projects/project-title";
import { EmptyState, NotFoundState, PageHeader } from "@/components/shell/route-states";
import { StepClosedNote } from "@/components/status/step-closed-note";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import {
  addressObjectionFn,
  answerDetailFn,
  proposeCodesFn,
  proposeDetailFn,
  proposeTreeFn,
  reviewCodesFn,
  settleDetailFn,
  skipReviewFn,
} from "@/server/details/functions";
import {
  detailBoardQueryOptions,
  detailKeys,
  treeBoardQueryOptions,
} from "@/server/details/query-options";
import { elementKeys } from "@/server/elements/query-options";
import { projectKeys } from "@/server/projects/query-options";
import { addValueListFn } from "@/server/rounds/functions";
import { roundKeys } from "@/server/rounds/query-options";

/**
 * The details of the elements in the model (DT1 to DT6, ADR 0017, ADR 0021): the tree of the
 * model, then per element a structure proposal, then a code proposal with its review, the
 * participants' consent and the facilitator's settling.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/details")({
  beforeLoad: requireStep("details"),
  loader: async ({ context, params }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(detailBoardQueryOptions(params.projectId)),
      context.queryClient.ensureQueryData(treeBoardQueryOptions(params.projectId)),
    ]);
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
  const { data: tree } = useSuspenseQuery(treeBoardQueryOptions(projectId));
  const proposeTree = useServerFn(proposeTreeFn);
  const propose = useServerFn(proposeDetailFn);
  const answer = useServerFn(answerDetailFn);
  const address = useServerFn(addressObjectionFn);
  const settle = useServerFn(settleDetailFn);
  const proposeCodes = useServerFn(proposeCodesFn);
  const review = useServerFn(reviewCodesFn);
  const skipReview = useServerFn(skipReviewFn);
  const addValueList = useServerFn(addValueListFn);

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
    addValueList: (proposalId) => addValueList({ data: { projectId, proposalId } }),
    settle: (proposalId, version) => settle({ data: { projectId, proposalId, version } }),
    proposeCodes: (elementId, version, codes) =>
      proposeCodes({ data: { projectId, elementId, version, ...codes } }),
    review: (proposalId, version, decision, note) =>
      review({ data: { projectId, proposalId, version, decision, note } }),
    skipReview: (proposalId, version, reason) =>
      skipReview({ data: { projectId, proposalId, version, reason } }),
    onChanged: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKeys.all(projectId) }),
        queryClient.invalidateQueries({ queryKey: elementKeys.board(projectId) }),
        queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) }),
        queryClient.invalidateQueries({ queryKey: roundKeys.project(projectId) }),
      ]);
    },
  };
  const { elements, mayPropose, mayProposeCodes, mayReview, mayAnswer, open, valueRounds } =
    board.value;

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
        <div className="flex flex-col gap-4">
          {tree.ok && (
            <TreeSection
              board={tree.value}
              facilitator={facilitator}
              actions={actions}
              projectId={projectId}
              valueRounds={valueRounds}
              proposeTree={(version, input) =>
                proposeTree({ data: { projectId, version, ...input } })
              }
            />
          )}
          <ul className="flex flex-col gap-4">
            {elements.map((element) => (
              <DetailCard
                key={element.id}
                element={element}
                mayPropose={mayPropose}
                mayProposeCodes={mayProposeCodes}
                mayReview={mayReview}
                mayAnswer={mayAnswer}
                facilitator={facilitator}
                open={open}
                actions={actions}
              />
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
