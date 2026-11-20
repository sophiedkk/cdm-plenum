// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { projectTitle } from "@/components/projects/project-title";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";

/** The Delphi rating rounds of the project (DE1 to DE13); the pages are its children. */
export const Route = createFileRoute("/_authed/projects/$projectId/rounds")({
  beforeLoad: requireStep("rounds"),
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.rounds_title()) }] }),
  component: Outlet,
});
