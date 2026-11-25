// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The server calls of the Details views, bound to the project, and the refresh after a change.
// The list, the element view and the tree view share them.
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import type { Outcome } from "@/lib/forms/outcome";
import type { TreeInput } from "@/lib/model-tree";
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
import { detailKeys } from "@/server/details/query-options";
import { elementKeys } from "@/server/elements/query-options";
import { projectKeys } from "@/server/projects/query-options";
import { addValueListFn } from "@/server/rounds/functions";
import { roundKeys } from "@/server/rounds/query-options";
import type { DetailActions } from "./detail-card";

export function useDetailActions(projectId: string): {
  actions: DetailActions;
  proposeTree: (version: number, input: TreeInput) => Promise<Outcome<unknown>>;
} {
  const queryClient = useQueryClient();
  const proposeTree = useServerFn(proposeTreeFn);
  const propose = useServerFn(proposeDetailFn);
  const answer = useServerFn(answerDetailFn);
  const address = useServerFn(addressObjectionFn);
  const settle = useServerFn(settleDetailFn);
  const proposeCodes = useServerFn(proposeCodesFn);
  const review = useServerFn(reviewCodesFn);
  const skipReview = useServerFn(skipReviewFn);
  const addValueList = useServerFn(addValueListFn);
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
  return {
    actions,
    proposeTree: (version, input) => proposeTree({ data: { projectId, version, ...input } }),
  };
}
