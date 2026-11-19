// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { projectTitle } from "@/components/projects/project-title";
import { PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";

/** The element board of the project (EL1 to EL8). */
export const Route = createFileRoute("/_authed/projects/$projectId/board")({
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.board_title()) }] }),
  component: Board,
});

function Board() {
  return <PageHeader level={2} title={m.board_title()} description={m.board_purpose()} />;
}
