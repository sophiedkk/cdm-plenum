// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailsBack } from "@/components/details/details-back";
import { TreeSection } from "@/components/details/tree-section";
import { useDetailActions } from "@/components/details/use-detail-actions";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { treeBoardQueryOptions } from "@/server/details/query-options";

/** The tree of the model on its own (DT6): the proposal, its answers and the editor. */
export const Route = createFileRoute("/_authed/projects/$projectId/details/tree")({
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.details_tree()) }],
  }),
  component: TreePage,
});

function TreePage() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const { data: tree } = useSuspenseQuery(treeBoardQueryOptions(projectId));
  const { actions, proposeTree } = useDetailActions(projectId);
  if (!tree.ok) {
    if (tree.error === "not_found") throw notFound();
    return <NotFoundState />;
  }
  return (
    <>
      <DetailsBack projectId={projectId} />
      <PageHeader level={2} title={m.details_title()} />
      <TreeSection
        board={tree.value}
        facilitator={project.role === "facilitator"}
        actions={actions}
        proposeTree={proposeTree}
      />
    </>
  );
}
