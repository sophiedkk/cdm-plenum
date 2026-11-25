// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { projectTitle } from "@/components/projects/project-title";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import { detailBoardQueryOptions, treeBoardQueryOptions } from "@/server/details/query-options";

/**
 * The details of the elements in the model (DT1 to DT6, ADR 0017, ADR 0021). The list, the view
 * of one element and the view of the tree are its children; they read one board.
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
  component: Outlet,
});
