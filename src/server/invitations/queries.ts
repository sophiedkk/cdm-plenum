// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Invitations into one stakeholder group (PR3, ADR 0004). The facilitator invites, lists and
// revokes; the invitee opens `/invite/<id>` and signs in, which accepts the invitation
// (acceptance.ts). The link works without e-mail: the facilitator can always copy it.
import { randomUUID } from "node:crypto";
import type { Kysely } from "kysely";
import { m } from "@/i18n/messages";
import { LEFT_ROLE } from "@/lib/project-roles";
import { normalizeEmail } from "../admin/app-roles.ts";
import type { DB } from "../db/schema.gen.ts";
import type { Mailer } from "../mail.ts";
import { done, type ProjectResult, refused, withProject } from "../projects/access.ts";
import { log } from "../projects/queries.ts";
import { INVITATION_LIFETIME_SECONDS } from "./lifetime.ts";
import type { InvitationInput, InviteInput } from "./schemas.ts";

/** The link an invitee opens. */
export function invitationUrl(baseUrl: string, invitationId: string): string {
  return new URL(`/invite/${encodeURIComponent(invitationId)}`, baseUrl).toString();
}

export interface CreatedInvitation {
  invitationId: string;
  url: string;
  /** False without SMTP or when sending failed; the facilitator then passes the link on. */
  emailSent: boolean;
}

/**
 * Invites an address into one stakeholder group of the project (facilitator only), then sends
 * the invitation e-mail when a mailer is configured. A failed e-mail keeps the invitation.
 */
export async function invite(
  db: Kysely<DB>,
  userId: string,
  input: InviteInput,
  deps: { baseUrl: string; mailer: Mailer | null; now: Date },
): Promise<ProjectResult<CreatedInvitation>> {
  const email = normalizeEmail(input.email);
  const created = await withProject<{
    invitationId: string;
    projectName: string;
    groupName: string;
  }>(db, userId, input.projectId, { invitation: ["create"] }, async (trx, project) => {
    const group = await trx
      .selectFrom("team")
      .select(["id", "name"])
      .where("id", "=", input.groupId)
      .where("organizationId", "=", project.id)
      .executeTakeFirst();
    if (!group) return refused("group_not_found");
    const member = await trx
      .selectFrom("member")
      .innerJoin("user", "user.id", "member.userId")
      .select("member.id")
      .where("member.organizationId", "=", project.id)
      .where("user.email", "=", email)
      // Someone who left (PR5) may be invited again.
      .where("member.role", "<>", LEFT_ROLE)
      .executeTakeFirst();
    if (member) return refused("already_member");
    const pending = await trx
      .selectFrom("invitation")
      .select("id")
      .where("organizationId", "=", project.id)
      .where("email", "=", email)
      .where("status", "=", "pending")
      .where("expiresAt", ">", deps.now)
      .executeTakeFirst();
    if (pending) return refused("already_invited");
    const invitationId = randomUUID();
    await trx
      .insertInto("invitation")
      .values({
        id: invitationId,
        organizationId: project.id,
        email,
        role: "participant",
        teamId: group.id,
        status: "pending",
        expiresAt: new Date(deps.now.getTime() + INVITATION_LIFETIME_SECONDS * 1000),
        createdAt: deps.now,
        inviterId: userId,
      })
      .execute();
    await log(trx, userId, project.id, "invitation_created", "invitation", invitationId);
    return done({ invitationId, projectName: project.name, groupName: group.name });
  });
  if (!created.ok) return created;
  const { invitationId, projectName, groupName } = created.value;
  const url = invitationUrl(deps.baseUrl, invitationId);
  let emailSent = false;
  if (deps.mailer) {
    try {
      await deps.mailer.send({
        to: email,
        subject: m.mail_invitation_subject({ project: projectName }),
        text: m.mail_invitation_body({
          project: projectName,
          group: groupName,
          url,
          hours: INVITATION_LIFETIME_SECONDS / 3600,
        }),
      });
      emailSent = true;
    } catch (error) {
      const kind = error instanceof Error ? error.name : "unknown";
      console.error(`invitation_mail_failed invitation=${invitationId} ${kind}`);
    }
  }
  return done({ invitationId, url, emailSent });
}

export type InvitationStatus = "pending" | "expired" | "accepted" | "canceled";

export interface InvitationRow {
  id: string;
  email: string;
  groupName: string | null;
  status: InvitationStatus;
  expiresAt: string;
  /** Only for a pending invitation that has not expired. */
  url: string | null;
}

function statusOf(status: string, expiresAt: Date, now: Date): InvitationStatus {
  if (status === "pending") return expiresAt > now ? "pending" : "expired";
  if (status === "accepted") return "accepted";
  return "canceled";
}

/** The invitations of a project, newest first, with a copyable link (facilitator only). */
export async function listInvitations(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  deps: { baseUrl: string; now: Date },
): Promise<ProjectResult<InvitationRow[]>> {
  return withProject(db, userId, projectId, { invitation: ["list"] }, async (trx, project) => {
    const rows = await trx
      .selectFrom("invitation")
      .leftJoin("team", "team.id", "invitation.teamId")
      .select([
        "invitation.id",
        "invitation.email",
        "invitation.status",
        "invitation.expiresAt",
        "team.name as groupName",
      ])
      .where("invitation.organizationId", "=", project.id)
      .orderBy("invitation.createdAt", "desc")
      .orderBy("invitation.id")
      .execute();
    return done(
      rows.map((row) => {
        const status = statusOf(row.status, row.expiresAt, deps.now);
        return {
          id: row.id,
          email: row.email,
          groupName: row.groupName,
          status,
          expiresAt: row.expiresAt.toISOString(),
          url: status === "pending" ? invitationUrl(deps.baseUrl, row.id) : null,
        };
      }),
    );
  });
}

/** Revokes a pending invitation (facilitator only); its link stops working at once. */
export async function revokeInvitation(
  db: Kysely<DB>,
  userId: string,
  input: InvitationInput,
): Promise<ProjectResult<null>> {
  return withProject(
    db,
    userId,
    input.projectId,
    { invitation: ["cancel"] },
    async (trx, project) => {
      const row = await trx
        .updateTable("invitation")
        .set({ status: "canceled" })
        .where("id", "=", input.invitationId)
        .where("organizationId", "=", project.id)
        .where("status", "=", "pending")
        .returning("id")
        .executeTakeFirst();
      if (!row) return refused("invitation_not_found");
      await log(trx, userId, project.id, "invitation_revoked", "invitation", row.id);
      return done(null);
    },
  );
}

/**
 * What the invitation page may show without a session: the project name, only while the
 * invitation is pending and unexpired. Anything else gives `null`, so a used, revoked or
 * expired link reveals nothing.
 */
export async function invitationPreview(
  db: Kysely<DB>,
  invitationId: string,
  now: Date,
): Promise<{ projectName: string } | null> {
  const row = await db
    .selectFrom("invitation")
    .innerJoin("organization", "organization.id", "invitation.organizationId")
    .select("organization.name")
    .where("invitation.id", "=", invitationId)
    .where("invitation.status", "=", "pending")
    .where("invitation.expiresAt", ">", now)
    .executeTakeFirst();
  return row ? { projectName: row.name } : null;
}
