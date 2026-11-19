// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The signed-in user as the app shell needs them: who they are and their application roles
// (AD1). Project roles are read per project, never here.
import type { Kysely } from "kysely";
import { APP_ROLES, type AppRole } from "../admin/app-roles.ts";
import type { DB } from "../db/schema.gen.ts";

export interface SessionUser {
  id: string;
  /** The account name; empty until the person sets one. */
  name: string;
  email: string;
  appRoles: AppRole[];
}

/** The user with `userId` and the application roles granted to their address, or `null`. */
export async function sessionUser(db: Kysely<DB>, userId: string): Promise<SessionUser | null> {
  const user = await db
    .selectFrom("user")
    .select(["id", "name", "email"])
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!user) return null;
  const roles = await db
    .selectFrom("app_role")
    .select("role")
    .where("email", "=", user.email)
    .execute();
  const held = new Set(roles.map((row) => row.role));
  return { ...user, appRoles: APP_ROLES.filter((role) => held.has(role)) };
}
