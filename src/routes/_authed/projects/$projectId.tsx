// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, Outlet } from "@tanstack/react-router";
import { PhaseBadge, RoleBadge } from "@/components/projects/project-badges";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import type { ProjectPhase } from "@/lib/project-phases";
import { projectQueryOptions } from "@/server/projects/query-options";
import { idSchema } from "@/server/projects/schemas";

/** The phases that show the Brainstorm tab (EL14). */
const BRAINSTORM_PHASES: readonly ProjectPhase[] = ["scope", "discover"];

const TAB_LINK =
  "-mb-px inline-flex border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground";

/**
 * The project layout: loads the project and the user's role in it once (docs/architecture.md,
 * "Application structure"); a non-member gets the not-found page (Q-SEC-1). Children read the
 * project from the route context.
 */
export const Route = createFileRoute("/_authed/projects/$projectId")({
  beforeLoad: async ({ context, params }) => {
    if (!idSchema.safeParse(params.projectId).success) throw notFound();
    const result = await context.queryClient.ensureQueryData(projectQueryOptions(params.projectId));
    if (!result.ok) throw notFound();
    return { project: result.value };
  },
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context) }] }),
  component: ProjectLayout,
  notFoundComponent: () => <NotFoundState title={m.projects_not_found_title()} />,
});

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { data } = useSuspenseQuery(projectQueryOptions(projectId));
  if (!data.ok) return <NotFoundState title={m.projects_not_found_title()} />;
  const project = data.value;
  const tabs = [
    { to: "/projects/$projectId/scope", label: m.projects_tab_scope() },
    // The brainstorm belongs before the Delphi; the page itself stays reachable in any phase.
    ...(BRAINSTORM_PHASES.includes(project.phase)
      ? [{ to: "/projects/$projectId/brainstorm", label: m.projects_tab_brainstorm() } as const]
      : []),
    { to: "/projects/$projectId/board", label: m.projects_tab_board() },
    { to: "/projects/$projectId/rounds", label: m.projects_tab_rounds() },
    { to: "/projects/$projectId/members", label: m.projects_tab_members() },
    ...(project.role === "facilitator"
      ? [{ to: "/projects/$projectId/export", label: m.projects_tab_export() } as const]
      : []),
  ] as const;

  return (
    <>
      <div className="mb-4 flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <dl className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">{m.projects_column_phase()}</dt>
            <dd>
              <PhaseBadge phase={project.phase} />
            </dd>
          </div>
          <div className="flex items-center gap-2">
            <dt className="text-muted-foreground">{m.projects_column_role()}</dt>
            <dd>
              <RoleBadge projectRole={project.role} />
            </dd>
          </div>
        </dl>
      </div>
      <nav aria-label={m.projects_tabs_label()} className="mb-6 border-b">
        <ul className="flex flex-wrap">
          {tabs.map((tab) => (
            <li key={tab.to}>
              <Link to={tab.to} params={{ projectId }} className={TAB_LINK}>
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}
