// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { RevealButton } from "@/components/board/brainstorm-panel";
import { AboutProject } from "@/components/projects/about-project";
import { DecidedSoFarSection } from "@/components/projects/decided-so-far";
import { OverviewChecklist } from "@/components/projects/overview-checklist";
import { projectTitle } from "@/components/projects/project-title";
import { TaskCard } from "@/components/projects/task-card";
import { NotFoundState } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { ROUND_PHASE, stepVisible } from "@/lib/phase-access";
import { PROJECT_PHASES } from "@/lib/project-phases";
import { revealBoardFn, sendBrainstormReminderFn } from "@/server/elements/functions";
import { brainstormStatusQueryOptions, elementKeys } from "@/server/elements/query-options";
import { leaveProjectFn, movePhaseFn } from "@/server/projects/functions";
import {
  decidedSoFarQueryOptions,
  groupsQueryOptions,
  overviewFactsQueryOptions,
  projectKeys,
  projectOverviewQueryOptions,
} from "@/server/projects/query-options";
import { roundKeys } from "@/server/rounds/query-options";

/**
 * The project's first page (PR8, PR11, ADR 0019): for a participant the home with "Your turn",
 * what is decided so far and "About this project"; for the facilitator the Overview with the
 * checklist of the phase and the phase move.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/")({
  loader: async ({ context, params }) => {
    const { queryClient, project } = context;
    if (project.role === "facilitator") {
      const facts = await queryClient.ensureQueryData({
        ...overviewFactsQueryOptions(params.projectId),
        revalidateIfStale: true,
      });
      if (!facts.ok) throw notFound();
      return;
    }
    const [decided, groups] = await Promise.all([
      queryClient.ensureQueryData({
        ...decidedSoFarQueryOptions(params.projectId),
        revalidateIfStale: true,
      }),
      queryClient.ensureQueryData(groupsQueryOptions(params.projectId)),
    ]);
    if (!decided.ok || !groups.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [
      {
        title:
          match.context.project?.role === "facilitator"
            ? projectTitle(match.context, m.projects_tab_overview())
            : projectTitle(match.context),
      },
    ],
  }),
  component: ProjectHome,
});

function ProjectHome() {
  const { project } = Route.useRouteContext();
  return project.role === "facilitator" ? <Overview /> : <ParticipantHome />;
}

function ParticipantHome() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const leave = useServerFn(leaveProjectFn);
  const { data: overview } = useSuspenseQuery(projectOverviewQueryOptions(projectId));
  const { data: decided } = useSuspenseQuery(decidedSoFarQueryOptions(projectId));
  const { data: groups } = useSuspenseQuery(groupsQueryOptions(projectId));
  if (!overview.ok || !decided.ok || !groups.ok) return <NotFoundState />;
  const phase = overview.value.phase;
  // Decided so far appears once rounds decide (PR8): in decide and hand-off.
  const showDecided =
    PROJECT_PHASES.indexOf(phase) >= PROJECT_PHASES.indexOf(ROUND_PHASE) &&
    stepVisible("participant", phase, "rounds");

  return (
    <>
      <TaskCard projectId={projectId} overview={overview.value} />
      {showDecided && <DecidedSoFarSection projectId={projectId} decided={decided.value} />}
      <AboutProject
        projectName={project.name}
        groups={groups.value}
        leave={() => leave({ data: { projectId } })}
        onLeft={async () => {
          await navigate({ to: "/projects" });
          queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
          await queryClient.invalidateQueries({ queryKey: projectKeys.list() });
        }}
      />
    </>
  );
}

function Overview() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const router = useRouter();
  const movePhase = useServerFn(movePhaseFn);
  const revealBoard = useServerFn(revealBoardFn);
  const remind = useServerFn(sendBrainstormReminderFn);
  const { data: overview } = useSuspenseQuery(projectOverviewQueryOptions(projectId));
  const { data: facts } = useSuspenseQuery(overviewFactsQueryOptions(projectId));
  const revealDue =
    overview.ok &&
    facts.ok &&
    overview.value.phase === "discover" &&
    facts.value.privateBrainstorm &&
    !facts.value.boardRevealed;
  // The reveal's confirmation lists the elements per participant (EL13).
  const { data: status } = useQuery({
    ...brainstormStatusQueryOptions(projectId),
    enabled: revealDue,
  });
  if (!overview.ok || !facts.ok) return <NotFoundState />;

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKeys.list() }),
      queryClient.invalidateQueries({ queryKey: elementKeys.all(projectId) }),
      queryClient.invalidateQueries({ queryKey: roundKeys.project(projectId) }),
    ]);
    await router.invalidate();
  }

  return (
    <OverviewChecklist
      projectId={projectId}
      phase={overview.value.phase}
      facts={facts.value}
      reveal={
        revealDue && status?.ok ? (
          <RevealButton
            participants={status.value.participants}
            reveal={() => revealBoard({ data: { projectId } })}
            onRevealed={refresh}
          />
        ) : undefined
      }
      remind={() => remind({ data: { projectId } })}
      move={(direction) =>
        movePhase({ data: { projectId, from: overview.value.phase, direction } })
      }
      onMoved={refresh}
    />
  );
}
