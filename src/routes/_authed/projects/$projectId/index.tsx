// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  FacilitatorPhasePanel,
  ParticipantTaskCard,
  PhaseSteps,
} from "@/components/projects/project-overview";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { movePhaseFn } from "@/server/projects/functions";
import { projectKeys, projectOverviewQueryOptions } from "@/server/projects/query-options";

/**
 * A project opens on its overview (PR4, PR8, ADR 0013): the phases as steps, the participant's
 * task for the current phase, or for the facilitator the status and the phase move.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/")({
  loader: async ({ context, params }) => {
    const overview = await context.queryClient.ensureQueryData(
      projectOverviewQueryOptions(params.projectId),
    );
    if (!overview.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.projects_overview_title()) }],
  }),
  component: Overview,
});

function Overview() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const router = useRouter();
  const movePhase = useServerFn(movePhaseFn);
  const { data } = useSuspenseQuery(projectOverviewQueryOptions(projectId));
  if (!data.ok) return <NotFoundState title={m.projects_not_found_title()} />;
  const overview = data.value;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
    ]);
    await router.invalidate();
  }

  return (
    <div>
      <PageHeader level={2} title={m.projects_overview_title()} />
      <div className="flex flex-col gap-4">
        <PhaseSteps phase={overview.phase} />
        {overview.role === "facilitator" ? (
          <FacilitatorPhasePanel
            projectId={projectId}
            overview={overview}
            move={(direction) =>
              movePhase({ data: { projectId, from: overview.phase, direction } })
            }
            onMoved={refresh}
          />
        ) : (
          <ParticipantTaskCard projectId={projectId} overview={overview} />
        )}
      </div>
    </div>
  );
}
