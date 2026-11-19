// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { FolderOpenIcon, PlusIcon } from "lucide-react";
import { PhaseBadge, RoleBadge } from "@/components/projects/project-badges";
import { EmptyState, PageHeader } from "@/components/shell/route-states";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/i18n/messages";
import { hasAppRole } from "@/lib/guards";
import { projectsQueryOptions } from "@/server/projects/query-options";

/** The user's projects with their role and the phase (PR2, PR4). */
export const Route = createFileRoute("/_authed/projects/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(projectsQueryOptions()),
  head: () => ({ meta: [{ title: `${m.projects_title()} | ${m.app_name()}` }] }),
  component: Projects,
});

function Projects() {
  const { data: projects } = useSuspenseQuery(projectsQueryOptions());
  const { user } = Route.useRouteContext();
  const mayCreate = hasAppRole(user, "facilitator");
  const newProject = mayCreate && (
    <Button asChild>
      <Link to="/projects/new">
        <PlusIcon aria-hidden="true" />
        {m.projects_new()}
      </Link>
    </Button>
  );

  return (
    <>
      <PageHeader
        title={m.projects_title()}
        description={m.projects_description()}
        actions={projects.length > 0 && newProject}
      />
      {projects.length === 0 ? (
        <EmptyState
          icon={<FolderOpenIcon aria-hidden="true" />}
          title={m.projects_empty_title()}
          description={mayCreate ? m.projects_empty_facilitator() : m.projects_empty_participant()}
        >
          {newProject}
        </EmptyState>
      ) : (
        <Table>
          <TableCaption className="sr-only">{m.projects_table_caption()}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">{m.projects_column_name()}</TableHead>
              <TableHead scope="col">{m.projects_column_role()}</TableHead>
              <TableHead scope="col">{m.projects_column_phase()}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {projects.map((project) => (
              <TableRow key={project.id}>
                <TableCell>
                  <Link
                    to="/projects/$projectId"
                    params={{ projectId: project.id }}
                    className="font-medium underline underline-offset-4 hover:decoration-2"
                  >
                    {project.name}
                  </Link>
                </TableCell>
                <TableCell>
                  <RoleBadge projectRole={project.role} />
                </TableCell>
                <TableCell>
                  <PhaseBadge phase={project.phase} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  );
}
