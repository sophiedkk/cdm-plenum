// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, Outlet, useMatchRoute } from "@tanstack/react-router";
import { ProjectHeader, ProjectTabs } from "@/components/projects/project-header";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { projectOverviewQueryOptions, projectQueryOptions } from "@/server/projects/query-options";
import { idSchema } from "@/server/projects/schemas";

/**
 * The project layout: loads the project and the user's role in it once (docs/architecture.md,
 * "Application structure"); a non-member gets the not-found page (Q-SEC-1). Children read the
 * project from the route context. The header's phase is read again on every navigation. A
 * participant navigates from the project home; the facilitator by fixed tabs (ADR 0019).
 */
export const Route = createFileRoute("/_authed/projects/$projectId")({
  beforeLoad: async ({ context, params }) => {
    if (!idSchema.safeParse(params.projectId).success) throw notFound();
    const result = await context.queryClient.ensureQueryData(projectQueryOptions(params.projectId));
    if (!result.ok) throw notFound();
    return { project: result.value };
  },
  loader: async ({ context, params }) => {
    const overview = await context.queryClient.ensureQueryData({
      ...projectOverviewQueryOptions(params.projectId),
      revalidateIfStale: true,
    });
    if (!overview.ok) throw notFound();
  },
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context) }] }),
  component: ProjectLayout,
  notFoundComponent: () => <NotFoundState title={m.projects_not_found_title()} />,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const matchRoute = useMatchRoute();
  const { data } = useSuspenseQuery(projectQueryOptions(projectId));
  const { data: overview } = useSuspenseQuery(projectOverviewQueryOptions(projectId));
  if (!data.ok || !overview.ok) return <NotFoundState title={m.projects_not_found_title()} />;
  const project = data.value;
  const facilitator = project.role === "facilitator";
  const home = Boolean(matchRoute({ to: "/projects/$projectId", params: { projectId } }));

  // The app shell's column holds every project page, so nothing here sets a width.
  return (
    <>
      <ProjectHeader
        projectId={projectId}
        name={project.name}
        overview={overview.value}
        back={facilitator || home ? "projects" : "home"}
      />
      {facilitator && <ProjectTabs projectId={projectId} />}
      <Outlet />
    </>
  );
}
