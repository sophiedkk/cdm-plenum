// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { projectTitle } from "@/components/projects/project-title";
import { PanelSetup } from "@/components/rounds/panel-setup";
import { valueOrNotFound } from "@/components/rounds/result-value";
import {
  GroupNamesForm,
  PrivateBrainstormForm,
  ProjectModeForm,
  RaterGroupForm,
} from "@/components/settings/facilitator-settings";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { Separator } from "@/components/ui/separator";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import { setPrivateBrainstormFn } from "@/server/elements/functions";
import { elementKeys } from "@/server/elements/query-options";
import {
  setGroupNamesVisibleFn,
  setProjectModeFn,
  setRaterGroupFn,
} from "@/server/projects/functions";
import {
  groupMembersQueryOptions,
  projectKeys,
  projectQueryOptions,
} from "@/server/projects/query-options";
import { setChangeClassFn, setPanelMinimumsFn } from "@/server/rounds/functions";
import {
  panelStatusQueryOptions,
  roundKeys,
  roundsQueryOptions,
} from "@/server/rounds/query-options";

/**
 * The facilitator's project settings (PR12, ADR 0018): the change class and the minimum panel
 * (DE11, DE13), how the project runs (PR14), the private brainstorm (EL13), whether participants see group names (PR7), and
 * the group the facilitator rates in (DE14). The server functions check the role again.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/settings")({
  beforeLoad: requireStep("settings"),
  loader: async ({ context, params }) => {
    const { queryClient } = context;
    const [panel, groups, rounds] = await Promise.all([
      queryClient.ensureQueryData(panelStatusQueryOptions(params.projectId)),
      queryClient.ensureQueryData(groupMembersQueryOptions(params.projectId)),
      queryClient.ensureQueryData(roundsQueryOptions(params.projectId)),
    ]);
    if (!panel.ok || !groups.ok || !rounds.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.projects_settings_title()) }],
  }),
  component: Settings,
});

function Settings() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: detail } = useSuspenseQuery(projectQueryOptions(projectId));
  const { data: panelResult } = useSuspenseQuery(panelStatusQueryOptions(projectId));
  const { data: groups } = useSuspenseQuery(groupMembersQueryOptions(projectId));
  const { data: rounds } = useSuspenseQuery(roundsQueryOptions(projectId));
  const setChangeClass = useServerFn(setChangeClassFn);
  const setPanelMinimums = useServerFn(setPanelMinimumsFn);
  const setPrivateBrainstorm = useServerFn(setPrivateBrainstormFn);
  const setGroupNamesVisible = useServerFn(setGroupNamesVisibleFn);
  const setRaterGroup = useServerFn(setRaterGroupFn);
  const setProjectMode = useServerFn(setProjectModeFn);
  if (!detail.ok || !groups.ok || !rounds.ok) return <NotFoundState />;
  const panel = valueOrNotFound(panelResult);
  const project = detail.value;
  // The server locks the group from opening to closing, `awaiting_close` included.
  const roundOpen = rounds.value.some(
    (round) => round.status === "open" || round.status === "awaiting_close",
  );
  const refreshPanel = () =>
    queryClient.invalidateQueries({ queryKey: roundKeys.panel(projectId) });
  const refreshProject = () =>
    queryClient.invalidateQueries({ queryKey: projectKeys.detail(projectId) });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        level={2}
        title={m.projects_settings_title()}
        description={m.projects_settings_purpose()}
      />
      <PanelSetup
        status={panel}
        saveChangeClass={async (changeClass) => {
          const result = await setChangeClass({ data: { projectId, changeClass } });
          if (!result.ok) return result;
          await refreshPanel();
          return { ok: true };
        }}
        saveMinimum={async (minimums, reason) => {
          const result = await setPanelMinimums({ data: { projectId, minimums, reason } });
          if (!result.ok) return result;
          await refreshPanel();
          toast.success(m.rounds_minimum_saved());
          return { ok: true };
        }}
      />
      <Separator />
      <div className="grid gap-10 lg:grid-cols-2">
        <ProjectModeForm
          mode={project.mode}
          locked={project.modeLocked}
          save={(mode) => setProjectMode({ data: { projectId, mode } })}
          onSaved={() => refreshProject()}
        />
        <PrivateBrainstormForm
          enabled={project.privateBrainstorm}
          revealed={project.boardRevealed}
          save={(enabled) => setPrivateBrainstorm({ data: { projectId, enabled } })}
          onSaved={async () => {
            await Promise.all([
              refreshProject(),
              queryClient.invalidateQueries({ queryKey: elementKeys.all(projectId) }),
            ]);
          }}
        />
        <GroupNamesForm
          visible={project.groupNamesVisible}
          save={(visible) => setGroupNamesVisible({ data: { projectId, visible } })}
          onSaved={() => refreshProject()}
        />
      </div>
      <Separator />
      <div className="max-w-xl">
        <RaterGroupForm
          key={project.ownGroupId ?? "none"}
          groups={groups.value}
          ownGroupId={project.ownGroupId}
          roundOpen={roundOpen}
          save={(groupId) => setRaterGroup({ data: { projectId, groupId } })}
          onSaved={async (groupName) => {
            toast.success(
              groupName === null
                ? m.members_rater_left()
                : m.members_rater_joined({ group: groupName }),
            );
            // The project detail holds the facilitator's group and nests the group keys.
            await Promise.all([
              refreshProject(),
              queryClient.invalidateQueries({ queryKey: roundKeys.project(projectId) }),
            ]);
          }}
        />
      </div>
    </div>
  );
}
