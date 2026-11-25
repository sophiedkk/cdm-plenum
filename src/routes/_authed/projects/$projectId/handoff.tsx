// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { ExportList } from "@/components/export/export-list";
import { ModelSummary } from "@/components/projects/phase-recap";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import { phaseRecapQueryOptions } from "@/server/projects/query-options";

/**
 * The hand-off page (PR4, owner decision 2026-11-25): the agreed model, read only, for every
 * member, and for the facilitator the downloads (EX1 to EX4). Other phases have no such page.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/handoff")({
  beforeLoad: (args) => {
    requireStep("handoff")(args);
    if (args.context.project.phase !== "handoff") {
      throw redirect({ to: "/projects/$projectId", params: args.params });
    }
  },
  loader: async ({ context, params }) => {
    const recap = await context.queryClient.ensureQueryData(
      phaseRecapQueryOptions(params.projectId, "detail"),
    );
    if (!recap.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.projects_phase_handoff()) }],
  }),
  component: Handoff,
});

function Handoff() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const { data: recap } = useSuspenseQuery(phaseRecapQueryOptions(projectId, "detail"));
  if (!recap.ok || recap.value.phase !== "detail") return <NotFoundState />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader level={2} title={m.projects_phase_handoff()} />
      {project.role === "facilitator" && (
        <section aria-labelledby="handoff-downloads" className="flex max-w-3xl flex-col gap-3">
          <h3 id="handoff-downloads" className="text-lg font-semibold">
            {m.projects_handoff_downloads()}
          </h3>
          <ExportList projectId={projectId} level={4} />
        </section>
      )}
      <ModelSummary recap={recap.value} />
    </div>
  );
}
