// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { projectTitle } from "@/components/projects/project-title";
import { PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";

/** The scope statement of the project (SC1 to SC3). */
export const Route = createFileRoute("/_authed/projects/$projectId/scope")({
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.scope_title()) }] }),
  component: Scope,
});

function Scope() {
  return <PageHeader level={2} title={m.scope_title()} description={m.scope_purpose()} />;
}
