// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { projectTitle } from "@/components/projects/project-title";
import { PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";

/** The stakeholder groups, members and invitations of the project (PR3, PR6). */
export const Route = createFileRoute("/_authed/projects/$projectId/members")({
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.members_title()) }] }),
  component: Members,
});

function Members() {
  return <PageHeader level={2} title={m.members_title()} description={m.members_purpose()} />;
}
