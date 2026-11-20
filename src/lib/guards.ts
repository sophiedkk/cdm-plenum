// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Route guards. They steer navigation only; every server function checks the session and the
// role again (Q-SEC-1, docs/architecture.md, "Roles and access"), and the phase (PR9).
import { redirect } from "@tanstack/react-router";
import type { AppRole } from "@/server/admin/app-roles";
import type { SessionUser } from "@/server/session/queries";
import { type ProjectStep, stepVisible } from "./phase-access.ts";
import type { ProjectPhase } from "./project-phases.ts";
import type { ProjectRole } from "./project-roles.ts";

/** Returns whether the user holds the application role. */
export function hasAppRole(user: Pick<SessionUser, "appRoles"> | null, role: AppRole): boolean {
  return user?.appRoles.includes(role) ?? false;
}

/** Sends a visitor without a session to the sign-in page. */
export function requireUser({ context }: { context: { user: SessionUser | null } }): {
  user: SessionUser;
} {
  if (!context.user) throw redirect({ to: "/sign-in" });
  return { user: context.user };
}

/** Sends a user without the application role to their projects. */
export function requireAppRole(role: AppRole) {
  return ({ context }: { context: { user: SessionUser } }): void => {
    if (!hasAppRole(context.user, role)) throw redirect({ to: "/projects" });
  };
}

/**
 * Sends a member to the project home (ADR 0019) when the phase hides `step`
 * from them (PR9, PR11). The facilitator sees every step (PR10). The server checks again.
 */
export function requireStep(step: ProjectStep) {
  return ({
    context,
    params,
  }: {
    context: { project: { role: ProjectRole; phase: ProjectPhase } };
    params: { projectId: string };
  }): void => {
    if (!stepVisible(context.project.role, context.project.phase, step)) {
      throw redirect({ to: "/projects/$projectId", params: { projectId: params.projectId } });
    }
  };
}
