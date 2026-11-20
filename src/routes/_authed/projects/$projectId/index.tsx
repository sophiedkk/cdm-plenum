// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, redirect } from "@tanstack/react-router";
import { mainStep } from "@/lib/phase-access";

/**
 * The project URL opens the current step's page (PR11, ADR 0018): a participant's task, or the
 * facilitator's main page of the phase. The project header shows the steps and the task there.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/")({
  beforeLoad: ({ context, params }) => {
    const step = mainStep(context.project.role, context.project.phase);
    throw redirect({ to: `/projects/$projectId/${step}`, params, replace: true });
  },
});
