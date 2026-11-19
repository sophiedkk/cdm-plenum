// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, redirect } from "@tanstack/react-router";

/** A project opens on its scope, the first phase (PR4). */
export const Route = createFileRoute("/_authed/projects/$projectId/")({
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/projects/$projectId/scope", params });
  },
});
