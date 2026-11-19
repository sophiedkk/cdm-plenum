// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";

/** The Delphi rating rounds of the project (DE1 to DE12). */
export const Route = createFileRoute("/_authed/projects/$projectId/rounds")({
  head: ({ match }) => ({
    meta: [{ title: `${m.rounds_title()} | ${match.context.project.name} | ${m.app_name()}` }],
  }),
  component: Rounds,
});

function Rounds() {
  return <PageHeader level={2} title={m.rounds_title()} description={m.rounds_purpose()} />;
}
