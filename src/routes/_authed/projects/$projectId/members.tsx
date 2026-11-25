// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, redirect } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { PlusIcon, UserPlusIcon } from "lucide-react";
import { toast } from "sonner";
import { FormDialog } from "@/components/members/form-dialog";
import { GroupActions, NewGroupForm } from "@/components/members/group-forms";
import { GroupPeopleTable } from "@/components/members/group-tables";
import { InvitationTable } from "@/components/members/invitation-table";
import { InviteForm } from "@/components/members/invite-form";
import { projectTitle } from "@/components/projects/project-title";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { inviteFn, restoreInvitationFn, revokeInvitationFn } from "@/server/invitations/functions";
import { INVITATION_LIFETIME_SECONDS } from "@/server/invitations/lifetime";
import { invitationKeys, invitationsQueryOptions } from "@/server/invitations/query-options";
import { createGroupFn, removeGroupFn, renameGroupFn } from "@/server/projects/functions";
import { groupMembersQueryOptions, projectKeys } from "@/server/projects/query-options";

const INVITATION_HOURS = INVITATION_LIFETIME_SECONDS / 3600;

/**
 * The People tab: the stakeholder groups, people and invitations of the project (PR3, PR6,
 * PR12), for the facilitator. They manage groups and invite in a dialog; the settings are on the
 * Settings page. A participant reads the groups on the project home (ADR 0019).
 */
export const Route = createFileRoute("/_authed/projects/$projectId/members")({
  beforeLoad: ({ context, params }) => {
    // A participant finds the groups and "Leave project" under "About this project" on the home.
    if (context.project.role !== "facilitator") {
      throw redirect({ to: "/projects/$projectId", params });
    }
  },
  loader: async ({ context, params }) => {
    const { queryClient } = context;
    const [groups, invitations] = await Promise.all([
      queryClient.ensureQueryData(groupMembersQueryOptions(params.projectId)),
      queryClient.ensureQueryData(invitationsQueryOptions(params.projectId)),
    ]);
    if (!groups.ok || !invitations.ok) throw notFound();
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.members_title()) }],
  }),
  component: Members,
});

function Members() {
  const { project } = Route.useRouteContext();
  return (
    <>
      <PageHeader level={2} title={m.members_title()} />
      <FacilitatorMembers projectId={project.id} />
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
  const restoreInvitation = useServerFn(restoreInvitationFn);
  if (!groups.ok || !invitations.ok) return <NotFoundState />;

  const refreshGroups = () =>
    queryClient.invalidateQueries({ queryKey: projectKeys.groups(projectId) });
  const refreshInvitations = () =>
    queryClient.invalidateQueries({ queryKey: invitationKeys.list(projectId) });

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="groups-title" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 id="groups-title" className="text-lg font-semibold">
            {m.members_groups_title()}
          </h3>
          <div className="flex flex-wrap gap-2">
            <FormDialog
              title={m.members_invite_title()}
              description={m.members_invitations_description({ hours: INVITATION_HOURS })}
              trigger={
                <Button type="button">
                  <UserPlusIcon aria-hidden="true" data-icon="inline-start" />
                  {m.members_invite_title()}
                </Button>
              }
            >
              {({ close, cancel }) => (
                <InviteForm
                  groups={groups.value}
                  invite={(input) => invite({ data: { projectId, ...input } })}
                  onInvited={async (email, invited) => {
                    if (invited.emailSent) toast.success(m.members_invite_sent({ email }));
                    else toast.info(m.members_invite_not_sent({ email }));
                    close();
                    await refreshInvitations();
                  }}
                  actions={cancel}
                />
              )}
            </FormDialog>
            <FormDialog
              title={m.members_new_group_title()}
              trigger={
                <Button type="button" variant="outline">
                  <PlusIcon aria-hidden="true" data-icon="inline-start" />
                  {m.members_new_group_title()}
                </Button>
              }
            >
              {({ close, cancel }) => (
                <NewGroupForm
                  create={(input) => createGroup({ data: { projectId, ...input } })}
                  onCreated={async (name) => {
                    toast.success(m.members_group_created({ group: name }));
                    close();
                    await refreshGroups();
                  }}
                  actions={cancel}
                />
              )}
            </FormDialog>
          </div>
        </div>
        <GroupPeopleTable
          groups={groups.value}
          actions={(group) => (
            <GroupActions
              group={group}
              rename={(name) => renameGroup({ data: { projectId, groupId: group.id, name } })}
              onRenamed={async (name) => {
                toast.success(m.members_group_renamed({ group: name }));
                await Promise.all([refreshGroups(), refreshInvitations()]);
              }}
              remove={() => removeGroup({ data: { projectId, groupId: group.id } })}
              restore={() =>
                createGroup({
                  data: { projectId, name: group.name, expertType: group.expertType },
                })
              }
              onChanged={refreshGroups}
            />
          )}
        />
      </section>
      <section aria-labelledby="invitations-title" className="flex flex-col gap-3">
        <h3 id="invitations-title" className="text-lg font-semibold">
          {m.members_invitations_title()}
        </h3>
        <InvitationTable
          invitations={invitations.value}
          revoke={(invitationId) => revokeInvitation({ data: { projectId, invitationId } })}
          restore={(invitationId) => restoreInvitation({ data: { projectId, invitationId } })}
          onRevoked={async () => {
            await Promise.all([refreshInvitations(), refreshGroups()]);
          }}
        />
      </section>
    </div>
  );
}
