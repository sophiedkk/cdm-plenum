// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, redirect } from "@tanstack/react-router";
import { ExportList } from "@/components/export/export-list";
import { projectTitle } from "@/components/projects/project-title";
import { PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";

/**
 * The downloads of the project (EX1, EX2, EX3, EX4), for its facilitator only. In the hand-off
 * phase they sit on the hand-off page with the model, so this URL leads there.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/export")({
  beforeLoad: (args) => {
    requireStep("export")(args);
    if (args.context.project.phase === "handoff") {
      throw redirect({ to: "/projects/$projectId/handoff", params: args.params });
    }
  },
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.export_title()) }] }),
  component: Export,
});

function Export() {
  const { projectId } = Route.useParams();
  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <PageHeader level={2} title={m.export_title()} description={m.export_purpose()} />
      <ExportList projectId={projectId} level={3} />
    </div>
  );
}
