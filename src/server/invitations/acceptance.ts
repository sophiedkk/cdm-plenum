// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Who may get an account, and what signing in does with pending invitations (PR1, PR3,
// ADR 0004). better-auth calls both from its database hooks (src/server/auth.ts).
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { LEFT_ROLE } from "@/lib/project-roles";
import { hasAnyAppRole, normalizeEmail } from "../admin/app-roles.ts";
import type { DB } from "../db/schema.gen.ts";

/** Returns whether an account exists for the address. */
export async function hasAccount(db: Kysely<DB>, email: string): Promise<boolean> {
  const row = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", normalizeEmail(email))
    .executeTakeFirst();
  return row !== undefined;
}

/** Returns whether a pending, unexpired invitation waits for the address. */
export async function hasPendingInvitation(
  db: Kysely<DB>,
  email: string,
  now: Date,
): Promise<boolean> {
  const row = await db
    .selectFrom("invitation")
    .select("id")
    .where("email", "=", normalizeEmail(email))
    .where("status", "=", "pending")
    .where("expiresAt", ">", now)
    .limit(1)
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * Returns whether an account may be created for the address: it has a pending, unexpired
 * invitation or an application role an administrator granted (PR1, AD1).
 */
export async function mayCreateAccount(db: Kysely<DB>, email: string, now: Date): Promise<boolean> {
  return (await hasPendingInvitation(db, email, now)) || (await hasAnyAppRole(db, email));
}

/**
 * Accepts every pending, unexpired invitation for the verified address of `userId`, in one
 * transaction: the user becomes a participant of the project, a member of the invitation's
 * stakeholder group, and gets a rating code for the project (ADR 0005). An existing membership
 * keeps its role and group. Returns the number of invitations accepted.
 */
export async function acceptInvitationsOnSignIn(
  db: Kysely<DB>,
  userId: string,
  now: Date,
): Promise<number> {
  return db.transaction().execute(async (trx) => {
    const user = await trx
      .selectFrom("user")
      .select(["email", "emailVerified"])
      .where("id", "=", userId)
      .executeTakeFirst();
    if (!user?.emailVerified) return 0;
    const pending = await trx
      .selectFrom("invitation")
      .select(["id", "organizationId", "teamId"])
      .where("email", "=", normalizeEmail(user.email))
      .where("status", "=", "pending")
      .where("expiresAt", ">", now)
      .orderBy("createdAt")
      .orderBy("id")
      .forUpdate()
      .execute();
    for (const invitation of pending) {
      const projectId = invitation.organizationId;
      let member = await trx
        .selectFrom("member")
        .select(["id", "role"])
        .where("organizationId", "=", projectId)
        .where("userId", "=", userId)
        .executeTakeFirst();
      if (member?.role === LEFT_ROLE) {
        // Someone who left (PR5) joins again with the rating code they had.
        await trx
          .updateTable("member")
          .set({ role: "participant" })
          .where("id", "=", member.id)
          .execute();
        await joinGroup(trx, projectId, invitation.teamId, userId, now);
      } else if (!member) {
        member = await trx
          .insertInto("member")
          .values({
            id: randomUUID(),
            organizationId: projectId,
            userId,
            role: "participant",
            createdAt: now,
          })
          .returning(["id", "role"])
          .executeTakeFirstOrThrow();
        await joinGroup(trx, projectId, invitation.teamId, userId, now);
      }
      await trx
        .insertInto("rating_code")
        .values({ project_id: projectId, member_id: member.id })
        .onConflict((oc) => oc.columns(["project_id", "member_id"]).doNothing())
        .execute();
      await trx
        .updateTable("invitation")
        .set({ status: "accepted" })
        .where("id", "=", invitation.id)
        .execute();
      await trx
        .insertInto("activity_log")
        .values({
          actor_user_id: userId,
          project_id: projectId,
          action: "invitation_accepted",
          target_type: "invitation",
          target_id: invitation.id,
        })
        .execute();
    }
    return pending.length;
  });
}

async function joinGroup(
  trx: Kysely<DB>,
  projectId: string,
  teamId: string | null,
  userId: string,
  now: Date,
): Promise<void> {
  if (teamId === null) return;
  const team = await trx
    .updateTable("team")
    .set((eb) => ({ memberCount: eb("memberCount", "+", 1) }))
    .where("id", "=", teamId)
    .where("organizationId", "=", projectId)
    .returning("id")
    .executeTakeFirst();
  if (!team) return;
  await trx
    .insertInto("teamMember")
    .values({ id: randomUUID(), teamId, userId, createdAt: now })
    .execute();
}
