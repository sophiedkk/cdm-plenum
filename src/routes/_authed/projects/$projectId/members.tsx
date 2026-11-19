// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  NewGroupForm,
  RemoveGroupDialog,
  RenameGroupDialog,
} from "@/components/members/group-forms";
import { GroupCountTable, GroupMemberTable } from "@/components/members/group-tables";
import { InvitationTable } from "@/components/members/invitation-table";
import { InviteForm } from "@/components/members/invite-form";
import { LeaveProject } from "@/components/members/leave-project";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { Separator } from "@/components/ui/separator";
import { m } from "@/i18n/messages";
import { inviteFn, revokeInvitationFn } from "@/server/invitations/functions";
import { INVITATION_LIFETIME_SECONDS } from "@/server/invitations/lifetime";
import { invitationKeys, invitationsQueryOptions } from "@/server/invitations/query-options";
import {
  createGroupFn,
  leaveProjectFn,
  removeGroupFn,
  renameGroupFn,
} from "@/server/projects/functions";
import {
  groupMembersQueryOptions,
  groupsQueryOptions,
  projectKeys,
} from "@/server/projects/query-options";

const INVITATION_HOURS = INVITATION_LIFETIME_SECONDS / 3600;

/**
 * The stakeholder groups, members and invitations of the project (PR3, PR5, PR6). The
 * facilitator manages groups and invitations; a participant sees the groups with the number of
 * participants in each, never their names, and can leave the project.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/members")({
  loader: async ({ context, params }) => {
    const { queryClient, project } = context;
    if (project.role === "facilitator") {
      const [groups, invitations] = await Promise.all([
        queryClient.ensureQueryData(groupMembersQueryOptions(params.projectId)),
        queryClient.ensureQueryData(invitationsQueryOptions(params.projectId)),
      ]);
      if (!groups.ok || !invitations.ok) throw notFound();
      return;
    }
    const groups = await queryClient.ensureQueryData(groupsQueryOptions(params.projectId));
    if (!groups.ok) throw notFound();
  },
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.members_title()) }] }),
  component: Members,
});

function Members() {
  const { project } = Route.useRouteContext();
  return (
    <>
      <PageHeader
        level={2}
        title={m.members_title()}
        description={
          project.role === "facilitator" ? m.members_purpose() : m.members_purpose_participant()
        }
      />
      {project.role === "facilitator" ? (
        <FacilitatorMembers projectId={project.id} />
      ) : (
        <ParticipantMembers projectId={project.id} projectName={project.name} />
      )}
    </>
  );
}

function FacilitatorMembers({ projectId }: Readonly<{ projectId: string }>) {
  const { data: groups } = useSuspenseQuery(groupMembersQueryOptions(projectId));
  const { data: invitations } = useSuspenseQuery(invitationsQueryOptions(projectId));
  const queryClient = useQueryClient();
  const createGroup = useServerFn(createGroupFn);
  const renameGroup = useServerFn(renameGroupFn);
  const removeGroup = useServerFn(removeGroupFn);
  const invite = useServerFn(inviteFn);
  const revokeInvitation = useServerFn(revokeInvitationFn);
  if (!groups.ok || !invitations.ok) return <NotFoundState />;

  const refreshGroups = () =>
    queryClient.invalidateQueries({ queryKey: projectKeys.groups(projectId) });
  const refreshInvitations = () =>
    queryClient.invalidateQueries({ queryKey: invitationKeys.list(projectId) });

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="groups-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 id="groups-title" className="text-lg font-semibold">
            {m.members_groups_title()}
          </h3>
          <p className="text-muted-foreground">{m.members_groups_description()}</p>
        </div>
        <GroupMemberTable
          groups={groups.value}
          actions={(group) => (
            <>
              <RenameGroupDialog
                group={group}
                rename={(name) => renameGroup({ data: { projectId, groupId: group.id, name } })}
                onRenamed={async (name) => {
                  toast.success(m.members_group_renamed({ group: name }));
                  await Promise.all([refreshGroups(), refreshInvitations()]);
                }}
              />
              <RemoveGroupDialog
                group={group}
                remove={() => removeGroup({ data: { projectId, groupId: group.id } })}
                onRemoved={async () => {
                  toast.success(m.members_group_removed({ group: group.name }));
                  await refreshGroups();
                }}
              />
            </>
          )}
        />
        <NewGroupForm
          create={(input) => createGroup({ data: { projectId, ...input } })}
          onCreated={async (name) => {
            toast.success(m.members_group_created({ group: name }));
            await refreshGroups();
          }}
        />
      </section>
      <Separator />
      <section aria-labelledby="invitations-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 id="invitations-title" className="text-lg font-semibold">
            {m.members_invitations_title()}
          </h3>
          <p className="text-muted-foreground">
            {m.members_invitations_description({ hours: INVITATION_HOURS })}
          </p>
        </div>
        <InviteForm
          groups={groups.value}
          invite={(input) => invite({ data: { projectId, ...input } })}
          onInvited={async (email, invited) => {
            if (invited.emailSent) toast.success(m.members_invite_sent({ email }));
            else toast.info(m.members_invite_not_sent({ email }));
            await refreshInvitations();
          }}
        />
        <InvitationTable
          invitations={invitations.value}
          revoke={(invitationId) => revokeInvitation({ data: { projectId, invitationId } })}
          onRevoked={async () => {
            await Promise.all([refreshInvitations(), refreshGroups()]);
          }}
        />
      </section>
    </div>
  );
}

function ParticipantMembers({
  projectId,
  projectName,
}: Readonly<{ projectId: string; projectName: string }>) {
  const { data: groups } = useSuspenseQuery(groupsQueryOptions(projectId));
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const leave = useServerFn(leaveProjectFn);
  if (!groups.ok) return <NotFoundState />;

  return (
    <div className="flex flex-col gap-10">
      <section aria-labelledby="groups-title" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 id="groups-title" className="text-lg font-semibold">
            {m.members_groups_title()}
          </h3>
          <p className="text-muted-foreground">{m.members_groups_description_participant()}</p>
        </div>
        <GroupCountTable groups={groups.value} />
      </section>
      <Separator />
      <LeaveProject
        projectName={projectName}
        leave={() => leave({ data: { projectId } })}
        onLeft={async () => {
          await navigate({ to: "/projects" });
          queryClient.removeQueries({ queryKey: projectKeys.detail(projectId) });
          await queryClient.invalidateQueries({ queryKey: projectKeys.list() });
        }}
      />
    </div>
  );
}
