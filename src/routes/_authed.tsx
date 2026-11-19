// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppShell } from "@/components/shell/app-shell";
import { requireUser } from "@/lib/guards";

/** Pathless layout: every child needs a session (PR1) and renders in the app shell. */
export const Route = createFileRoute("/_authed")({
  beforeLoad: requireUser,
  component: AuthedLayout,
});

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  return (
    <AppShell user={user}>
      <Outlet />
    </AppShell>
  );
}
