// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Route guards. They steer navigation only; every server function checks the session and the
// role again (Q-SEC-1, docs/architecture.md, "Roles and access").
import { redirect } from "@tanstack/react-router";
import type { AppRole } from "@/server/admin/app-roles";
import type { SessionUser } from "@/server/session/queries";

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
