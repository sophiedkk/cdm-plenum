// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Application-wide roles (AD1, owner decision 2026-11-19): `administrator`, and `facilitator`,
// the right to create projects. Held apart from the project roles. A grant names an e-mail
// address, so it lets a person in before their account exists (PR1). Relative imports only:
// the grant command runs on plain Node.
import type { Kysely } from "kysely";
import { APP_ROLE_KEYS } from "../db/migrations/0003_access.ts";
import type { DB } from "../db/schema.gen.ts";

export const APP_ROLES = APP_ROLE_KEYS;
export type AppRole = (typeof APP_ROLES)[number];

/** Returns `email` as better-auth stores it: trimmed, in lower case. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export type GrantOutcome = "granted" | "already_granted";
export type RevokeOutcome = "revoked" | "not_granted";

/**
 * Grants `role` to the address; a second grant changes nothing. `actorUserId` is the
 * administrator who granted it on the administration page; the host command has none.
 */
export async function grantAppRole(
  db: Kysely<DB>,
  email: string,
  role: AppRole,
  actorUserId: string | null = null,
): Promise<GrantOutcome> {
  const row = await db
    .insertInto("app_role")
    .values({ email: normalizeEmail(email), role })
    .onConflict((oc) => oc.columns(["email", "role"]).doNothing())
    .returning("email")
    .executeTakeFirst();
  if (!row) return "already_granted";
  await logRoleChange(db, email, role, "app_role_granted", actorUserId);
  return "granted";
}

/**
 * Revokes `role` from the address. Projects the person created and their project roles stay:
 * the right only governs creating new projects.
 */
export async function revokeAppRole(
  db: Kysely<DB>,
  email: string,
  role: AppRole,
  actorUserId: string | null = null,
): Promise<RevokeOutcome> {
  const row = await db
    .deleteFrom("app_role")
    .where("email", "=", normalizeEmail(email))
    .where("role", "=", role)
    .returning("email")
    .executeTakeFirst();
  if (!row) return "not_granted";
  await logRoleChange(db, email, role, "app_role_revoked", actorUserId);
  return "revoked";
}

/** Returns whether the address holds any application role. */
export async function hasAnyAppRole(db: Kysely<DB>, email: string): Promise<boolean> {
  const row = await db
    .selectFrom("app_role")
    .select("role")
    .where("email", "=", normalizeEmail(email))
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}

/** Returns whether the user with `userId` holds `role`, read through their account's address. */
export async function userHasAppRole(
  db: Kysely<DB>,
  userId: string,
  role: AppRole,
): Promise<boolean> {
  const row = await db
    .selectFrom("user")
    .innerJoin("app_role", "app_role.email", "user.email")
    .select("app_role.role")
    .where("user.id", "=", userId)
    .where("app_role.role", "=", role)
    .executeTakeFirst();
  return row !== undefined;
}

// The log names the account id when there is one, never the address (Q-PRIV-2).
async function logRoleChange(
  db: Kysely<DB>,
  email: string,
  role: AppRole,
  action: "app_role_granted" | "app_role_revoked",
  actorUserId: string | null,
): Promise<void> {
  const user = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", normalizeEmail(email))
    .executeTakeFirst();
  await db
    .insertInto("activity_log")
    .values({
      action,
      actor_user_id: actorUserId,
      target_type: `app_role:${role}`,
      target_id: user?.id ?? null,
    })
    .execute();
}
