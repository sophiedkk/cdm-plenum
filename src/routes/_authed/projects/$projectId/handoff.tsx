// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { ModelSummary } from "@/components/projects/phase-recap";
import { projectTitle } from "@/components/projects/project-title";
import { TaskBar } from "@/components/projects/task-bar";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import { phaseRecapQueryOptions } from "@/server/projects/query-options";

/**
 * The hand-off page (PR4, owner decision 2026-11-25): the agreed model in plain words, read only,
 * for the participants. The facilitator's hand-off, with the downloads (EX1 to EX4), is the
 * Overview, so the facilitator is sent there. Other phases have no such page.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/handoff")({
  beforeLoad: (args) => {
    requireStep("handoff")(args);
    if (args.context.project.phase !== "handoff" || args.context.project.role === "facilitator") {
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
  const { data: recap } = useSuspenseQuery(phaseRecapQueryOptions(projectId, "detail"));
  if (!recap.ok || recap.value.phase !== "detail") return <NotFoundState />;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader level={2} title={m.projects_phase_handoff()} />
      <TaskBar
        projectId={projectId}
        done={{
          title: m.projects_bar_handoff_title(),
          next: m.projects_bar_handoff_done(),
        }}
        filledBack
      />
      <ModelSummary recap={recap.value} handoff />
    </div>
  );
}
