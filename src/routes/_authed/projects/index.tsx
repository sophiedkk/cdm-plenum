// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpenIcon, PlusIcon } from "lucide-react";
import { ProjectRow } from "@/components/projects/project-row";
import { EmptyState, PageHeader } from "@/components/shell/route-states";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { hasAppRole } from "@/lib/guards";
import { projectsQueryOptions } from "@/server/projects/query-options";

/**
 * The user's projects (PR2, PR8): each with its phase and what waits for this person there,
 * the projects with something waiting first.
 */
export const Route = createFileRoute("/_authed/projects/")({
  loader: ({ context }) =>
    context.queryClient.ensureQueryData({ ...projectsQueryOptions(), revalidateIfStale: true }),
  head: () => ({ meta: [{ title: `${m.projects_title()} | ${m.app_name()}` }] }),
  component: Projects,
});

function Projects() {
  const { data: projects } = useSuspenseQuery(projectsQueryOptions());
  const { user } = Route.useRouteContext();
  const mayCreate = hasAppRole(user, "facilitator");
  const newProject = (primary: boolean) =>
    mayCreate && (
      <Button asChild variant={primary ? "default" : "outline"}>
        <Link to="/projects/new">
          <PlusIcon aria-hidden="true" />
          {m.projects_new()}
        </Link>
      </Button>
    );

  return (
    <>
      <PageHeader title={m.projects_title()} actions={projects.length > 0 && newProject(false)} />
      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpenIcon aria-hidden="true" />}
          title={m.projects_empty_title()}
          description={mayCreate ? m.projects_empty_facilitator() : m.projects_empty_participant()}
        >
          {newProject(true)}
        </EmptyState>
      ) : (
        <ul aria-label={m.projects_list_label()} className="border-t">
          {projects.map((project) => (
            <li key={project.id} className="border-b">
              <ProjectRow
                project={project}
                link={(children, className) => (
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className={className}
                  >
                    {children}
                  </Link>
                )}
              />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
