// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound, Outlet, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ProjectHeader } from "@/components/projects/project-header";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { type ProjectStep, visibleSteps } from "@/lib/phase-access";
import { cn } from "@/lib/utils";
import { movePhaseFn } from "@/server/projects/functions";
import {
  projectKeys,
  projectOverviewQueryOptions,
  projectQueryOptions,
} from "@/server/projects/query-options";
import { idSchema } from "@/server/projects/schemas";

/** The tab of each project step. */
const STEP_TABS = {
  scope: { to: "/projects/$projectId/scope", label: m.projects_tab_scope },
  brainstorm: { to: "/projects/$projectId/brainstorm", label: m.projects_tab_brainstorm },
  board: { to: "/projects/$projectId/board", label: m.projects_tab_board },
  rounds: { to: "/projects/$projectId/rounds", label: m.projects_tab_rounds },
  export: { to: "/projects/$projectId/export", label: m.projects_tab_export },
  members: { to: "/projects/$projectId/members", label: m.projects_tab_members },
  settings: { to: "/projects/$projectId/settings", label: m.projects_tab_settings },
} as const satisfies Record<ProjectStep, { to: string; label: () => string }>;

/** The tabs that sit apart at the far end, after the work of the project. */
const END_TABS: readonly ProjectStep[] = ["members", "settings"];

const TAB_LINK =
  "-mb-px inline-flex border-b-2 border-transparent px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground";

/**
 * The project layout: loads the project and the user's role in it once (docs/architecture.md,
 * "Application structure"); a non-member gets the not-found page (Q-SEC-1). Children read the
 * project from the route context. The header's counts are read again on every navigation.
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
  const queryClient = useQueryClient();
  const router = useRouter();
  const movePhase = useServerFn(movePhaseFn);
  const { data } = useSuspenseQuery(projectQueryOptions(projectId));
  const { data: overview } = useSuspenseQuery(projectOverviewQueryOptions(projectId));
  if (!data.ok || !overview.ok) return <NotFoundState title={m.projects_not_found_title()} />;
  const project = data.value;
  // The phase table decides which steps a member sees and in which order (PR9, PR11).
  const steps = visibleSteps(project.role, project.phase);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
    ]);
    await router.invalidate();
  }

  return (
    <>
      <ProjectHeader
        projectId={projectId}
        name={project.name}
        overview={overview.value}
        move={(direction) =>
          movePhase({ data: { projectId, from: overview.value.phase, direction } })
        }
        onMoved={refresh}
      />
      <nav aria-label={m.projects_tabs_label()} className="mb-5 border-b">
        <ul className="flex flex-wrap">
          {steps.map((step, index) => {
            const tab = STEP_TABS[step];
            const firstAtEnd =
              END_TABS.includes(step) && !END_TABS.includes(steps[index - 1] ?? step);
            return (
              <li key={step} className={cn(firstAtEnd && "ml-auto")}>
                <Link to={tab.to} params={{ projectId }} className={TAB_LINK}>
                  {tab.label()}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <Outlet />
    </>
  );
}
