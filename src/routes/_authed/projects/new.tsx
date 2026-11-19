// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { NewProjectForm } from "@/components/projects/new-project-form";
import { PageHeader } from "@/components/shell/route-states";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { requireAppRole } from "@/lib/guards";
import { createProjectFn } from "@/server/projects/functions";
import { projectKeys } from "@/server/projects/query-options";

/** A new project (PR2), for holders of the facilitator right only. */
export const Route = createFileRoute("/_authed/projects/new")({
  beforeLoad: requireAppRole("facilitator"),
  head: () => ({ meta: [{ title: `${m.projects_new_title()} | ${m.app_name()}` }] }),
  component: NewProject,
});

function NewProject() {
  const createProject = useServerFn(createProjectFn);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return (
    <div className="max-w-xl">
      <PageHeader title={m.projects_new_title()} description={m.projects_new_description()} />
      <NewProjectForm
        create={(name) => createProject({ data: { name } })}
        onCreated={async (projectId, name) => {
          await queryClient.invalidateQueries({ queryKey: projectKeys.list() });
          toast.success(m.projects_created({ name }));
          await navigate({ to: "/projects/$projectId/scope", params: { projectId } });
        }}
        actions={
          <Button asChild variant="outline">
            <Link to="/projects">{m.common_cancel()}</Link>
          </Button>
        }
      />
    </div>
  );
}
