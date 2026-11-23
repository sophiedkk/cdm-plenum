// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { PhaseRecapView } from "@/components/projects/phase-recap";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { projectPhaseLabel } from "@/lib/i18n/labels";
import { isProjectPhase, type ProjectPhase, phaseDone } from "@/lib/project-phases";
import { phaseRecapQueryOptions } from "@/server/projects/query-options";

/**
 * The read-only recap of a done phase (PR13, ADR 0020), opened from its step in the header. The
 * current phase and the later ones have no recap; their URL leads to the project's first page.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/recap/$phase")({
  beforeLoad: ({ context, params }) => {
    if (!isProjectPhase(params.phase)) throw notFound();
    if (!phaseDone(context.project.phase, params.phase)) {
      throw redirect({ to: "/projects/$projectId", params: { projectId: params.projectId } });
    }
    return { phase: params.phase as ProjectPhase };
  },
  loader: async ({ context, params }) => {
    const recap = await context.queryClient.ensureQueryData(
      phaseRecapQueryOptions(params.projectId, context.phase),
    );
    if (!recap.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [
      {
        title: projectTitle(
          match.context,
          isProjectPhase(match.params.phase)
            ? m.projects_recap_title({ phase: projectPhaseLabel(match.params.phase) })
            : undefined,
        ),
      },
    ],
  }),
  component: Recap,
});

function Recap() {
  const { projectId } = Route.useParams();
  const { phase } = Route.useRouteContext();
  const { data: recap } = useSuspenseQuery(phaseRecapQueryOptions(projectId, phase));
  if (!recap.ok) return <NotFoundState />;
  return <PhaseRecapView projectId={projectId} recap={recap.value} />;
}
