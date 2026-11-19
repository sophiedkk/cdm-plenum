// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The administration page (AD1, AD2): application rights by e-mail address, accounts and their
// deactivation, and the activity log. Every function checks that the actor holds the
// administrator right; an administrator sees no project content (docs/architecture.md).
import type { Kysely, Transaction } from "kysely";
import type { DB } from "../db/schema.gen.ts";
import {
  APP_ROLES,
  type AppRole,
  grantAppRole,
  normalizeEmail,
  revokeAppRole,
  userHasAppRole,
} from "./app-roles.ts";
import {
  ACTIVITY_LIMIT,
  type AccountInput,
  type ActivityInput,
  type AppRoleInput,
} from "./schemas.ts";

/** Why an administration action was refused; the screens map each code to a message. */
export const ADMIN_ACTION_ERRORS = ["forbidden", "account_not_found", "own_account"] as const;
export type AdminActionError = (typeof ADMIN_ACTION_ERRORS)[number];

export type AdminResult<T> = { ok: true; value: T } | { ok: false; error: AdminActionError };

function done<T>(value: T): AdminResult<T> {
  return { ok: true, value };
}

function refused<T>(error: AdminActionError): AdminResult<T> {
  return { ok: false, error };
}

/** Runs `action` in one transaction when the actor holds the administrator right. */
async function asAdministrator<T>(
  db: Kysely<DB>,
  userId: string,
  action: (trx: Transaction<DB>) => Promise<AdminResult<T>>,
): Promise<AdminResult<T>> {
  return db.transaction().execute(async (trx) => {
    if (!(await userHasAppRole(trx, userId, "administrator"))) return refused<T>("forbidden");
    return action(trx);
  });
}

/** One e-mail address and the application rights granted to it. */
export interface AppRoleHolder {
  email: string;
  roles: AppRole[];
  /** Whether an account exists for the address; a grant can wait for its first sign-in. */
  hasAccount: boolean;
}

/** Every address with an application right, by address. */
export async function listAppRoles(
  db: Kysely<DB>,
  userId: string,
): Promise<AdminResult<AppRoleHolder[]>> {
  return asAdministrator(db, userId, async (trx) => {
    const rows = await trx
      .selectFrom("app_role")
      .leftJoin("user", "user.email", "app_role.email")
      .select(["app_role.email", "app_role.role", "user.id as userId"])
      .orderBy("app_role.email")
      .execute();
    const byEmail = new Map<string, AppRoleHolder>();
    for (const row of rows) {
      const holder = byEmail.get(row.email) ?? {
        email: row.email,
        roles: [],
        hasAccount: row.userId !== null,
      };
      holder.roles.push(row.role as AppRole);
      byEmail.set(row.email, holder);
    }
    return done(
      [...byEmail.values()].map((holder) => ({
        ...holder,
        roles: APP_ROLES.filter((role) => holder.roles.includes(role)),
      })),
    );
  });
}

/** The address of the acting administrator. */
async function ownEmail(trx: Kysely<DB>, userId: string): Promise<string> {
  const row = await trx
    .selectFrom("user")
    .select("email")
    .where("id", "=", userId)
    .executeTakeFirstOrThrow();
  return normalizeEmail(row.email);
}

/** Grants a right to an address; a second grant changes nothing. */
export async function grantRole(
  db: Kysely<DB>,
  userId: string,
  input: AppRoleInput,
): Promise<AdminResult<null>> {
  return asAdministrator(db, userId, async (trx) => {
    await grantAppRole(trx, input.email, input.role, userId);
    return done(null);
  });
}

/**
 * Revokes a right from an address. An administrator cannot remove their own administrator
 * right (`own_account`), so the last administrator cannot lock everyone out.
 */
export async function revokeRole(
  db: Kysely<DB>,
  userId: string,
  input: AppRoleInput,
): Promise<AdminResult<null>> {
  return asAdministrator(db, userId, async (trx) => {
    if (
      input.role === "administrator" &&
      normalizeEmail(input.email) === (await ownEmail(trx, userId))
    ) {
      return refused("own_account");
    }
    await revokeAppRole(trx, input.email, input.role, userId);
    return done(null);
  });
}

/** An account as the administrator manages it. */
export interface AccountRow {
  id: string;
  email: string;
  /** The account name; empty until the person sets one. */
  name: string;
  createdAt: string;
  /** When the account was deactivated, or `null` while it is active. */
  deactivatedAt: string | null;
}

/** Every account, by address. */
export async function listAccounts(
  db: Kysely<DB>,
  userId: string,
): Promise<AdminResult<AccountRow[]>> {
  return asAdministrator(db, userId, async (trx) => {
    const rows = await trx
      .selectFrom("user")
      .select(["id", "email", "name", "createdAt", "deactivated_at"])
      .orderBy("email")
      .execute();
    return done(
      rows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        createdAt: row.createdAt.toISOString(),
        deactivatedAt: row.deactivated_at?.toISOString() ?? null,
      })),
    );
  });
}

async function logAccount(
  trx: Kysely<DB>,
  actorUserId: string,
  action: "account_deactivated" | "account_reactivated",
  targetUserId: string,
): Promise<void> {
  await trx
    .insertInto("activity_log")
    .values({
      actor_user_id: actorUserId,
      action,
      target_type: "user",
      target_id: targetUserId,
    })
    .execute();
}

/**
 * Deactivates an account (AD1): it can no longer sign in and its sessions end now. Its
 * memberships, ratings and authorship stay. An administrator cannot deactivate themselves.
 */
export async function deactivateAccount(
  db: Kysely<DB>,
  userId: string,
  input: AccountInput,
  now: Date,
): Promise<AdminResult<null>> {
  return asAdministrator(db, userId, async (trx) => {
    if (input.userId === userId) return refused("own_account");
    const user = await trx
      .selectFrom("user")
      .select(["id", "deactivated_at"])
      .where("id", "=", input.userId)
      .forUpdate()
      .executeTakeFirst();
    if (!user) return refused("account_not_found");
    if (user.deactivated_at === null) {
      await trx
        .updateTable("user")
        .set({ deactivated_at: now })
        .where("id", "=", user.id)
        .execute();
      await logAccount(trx, userId, "account_deactivated", user.id);
    }
    await trx.deleteFrom("session").where("userId", "=", user.id).execute();
    return done(null);
  });
}

/** Lets a deactivated account sign in again. */
export async function reactivateAccount(
  db: Kysely<DB>,
  userId: string,
  input: AccountInput,
): Promise<AdminResult<null>> {
  return asAdministrator(db, userId, async (trx) => {
    const user = await trx
      .updateTable("user")
      .set({ deactivated_at: null })
      .where("id", "=", input.userId)
      .where("deactivated_at", "is not", null)
      .returning("id")
      .executeTakeFirst();
    if (user) {
      await logAccount(trx, userId, "account_reactivated", user.id);
      return done(null);
    }
    const exists = await trx
      .selectFrom("user")
      .select("id")
      .where("id", "=", input.userId)
      .executeTakeFirst();
    return exists ? done(null) : refused("account_not_found");
  });
}

/** Returns whether the account with `userId` is deactivated (AD1); `false` for no account. */
export async function isDeactivated(db: Kysely<DB>, userId: string): Promise<boolean> {
  const row = await db
    .selectFrom("user")
    .select("deactivated_at")
    .where("id", "=", userId)
    .executeTakeFirst();
  return row?.deactivated_at != null;
}

/** Returns whether the account of the address is deactivated (AD1). */
export async function isDeactivatedEmail(db: Kysely<DB>, email: string): Promise<boolean> {
  const row = await db
    .selectFrom("user")
    .select("deactivated_at")
    .where("email", "=", normalizeEmail(email))
    .executeTakeFirst();
  return row?.deactivated_at != null;
}

/** One activity log entry: ids, the action code and the actor's name, never content (AD2). */
export interface ActivityEntry {
  id: string;
  occurredAt: string;
  action: string;
  actorUserId: string | null;
  /** The actor's account name; empty when they set none or there is no actor. */
  actorName: string;
  projectId: string | null;
  targetType: string | null;
  targetId: string | null;
}

export interface ActivityLog {
  entries: ActivityEntry[];
  /** Every action code in the log, for the filter. */
  actions: string[];
}

/** The newest activity log entries, optionally of one action, newest first (AD2). */
export async function listActivity(
  db: Kysely<DB>,
  userId: string,
  input: ActivityInput,
): Promise<AdminResult<ActivityLog>> {
  return asAdministrator(db, userId, async (trx) => {
    let query = trx
      .selectFrom("activity_log")
      .leftJoin("user", "user.id", "activity_log.actor_user_id")
      .select([
        "activity_log.id",
        "activity_log.occurred_at",
        "activity_log.action",
        "activity_log.actor_user_id",
        "user.name as actorName",
        "activity_log.project_id",
        "activity_log.target_type",
        "activity_log.target_id",
      ])
      .orderBy("activity_log.occurred_at", "desc")
      .orderBy("activity_log.id", "desc")
      .limit(ACTIVITY_LIMIT);
    if (input.action !== undefined) query = query.where("activity_log.action", "=", input.action);
    const rows = await query.execute();
    const actions = await trx
      .selectFrom("activity_log")
      .select("action")
      .distinct()
      .orderBy("action")
      .execute();
    return done({
      entries: rows.map((row) => ({
        id: row.id,
        occurredAt: row.occurred_at.toISOString(),
        action: row.action,
        actorUserId: row.actor_user_id,
        actorName: row.actorName ?? "",
        projectId: row.project_id,
        targetType: row.target_type,
        targetId: row.target_id,
      })),
      actions: actions.map((row) => row.action),
    });
  });
}
