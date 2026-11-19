// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, redirect } from "@tanstack/react-router";
import { projectTitle } from "@/components/projects/project-title";
import { PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";

/** The exports of the project (EX1 to EX5), for its facilitator only. */
export const Route = createFileRoute("/_authed/projects/$projectId/export")({
  beforeLoad: ({ context, params }) => {
    if (context.project.role !== "facilitator") {
      throw redirect({ to: "/projects/$projectId/scope", params });
    }
  },
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.export_title()) }] }),
  component: Export,
});

function Export() {
  return <PageHeader level={2} title={m.export_title()} description={m.export_purpose()} />;
}
