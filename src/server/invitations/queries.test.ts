// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Invitations and their acceptance (PR1, PR3, ADR 0004) on real PostgreSQL, with a negative
// test per role: a participant cannot invite, a non-member gets `not_found`.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { grantAppRole, userHasAppRole } from "../admin/app-roles.ts";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import type { Mailer, MailMessage } from "../mail.ts";
import { emailOf, facilitatorWithProject, groupId, insertUser } from "../test-fixtures.ts";
import { acceptInvitationsOnSignIn, hasPendingInvitation, mayCreateAccount } from "./acceptance.ts";
import { INVITATION_LIFETIME_SECONDS } from "./lifetime.ts";
import {
  invitationPreview,
  invite,
  listInvitations,
  restoreInvitation,
  revokeInvitation,
} from "./queries.ts";

const BASE = "http://localhost:3000";
const HOUR = 3_600_000;
let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

function capture(): Mailer & { sent: MailMessage[] } {
  const sent: MailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
  };
}

async function setup() {
  const { userId: facilitator, projectId, email } = await facilitatorWithProject(db);
  const nursing = await groupId(db, projectId, "Nursing");
  return { facilitator, facilitatorEmail: email, projectId, nursing };
}

async function inviteAddress(
  facilitator: string,
  projectId: string,
  group: string,
  email: string,
  now = new Date(),
) {
  const result = await invite(
    db,
    facilitator,
    { projectId, groupId: group, email },
    { baseUrl: BASE, mailer: null, now },
  );
  if (!result.ok) throw new Error(result.error);
  return result.value;
}

describe("invite (PR3)", () => {
  it("creates a pending participant invitation for one group, with a link and an e-mail", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const mailer = capture();
    const now = new Date();
    const result = await invite(
      db,
      facilitator,
      { projectId, groupId: nursing, email: "New.Person@Example.test" },
      { baseUrl: BASE, mailer, now },
    );
    if (!result.ok) throw new Error(result.error);
    expect(result.value.url).toBe(`${BASE}/invite/${result.value.invitationId}`);
    expect(result.value.emailSent).toBe(true);
    const row = await db
      .selectFrom("invitation")
      .selectAll()
      .where("id", "=", result.value.invitationId)
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      email: "new.person@example.test",
      role: "participant",
      teamId: nursing,
      status: "pending",
      inviterId: facilitator,
    });
    expect(row.expiresAt.getTime()).toBe(now.getTime() + INVITATION_LIFETIME_SECONDS * 1000);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("new.person@example.test");
    expect(mailer.sent[0]?.subject).toBe("Invitation to the project Blood pressure");
    expect(mailer.sent[0]?.text).toContain(result.value.url);
    expect(mailer.sent[0]?.text).toContain("Nursing");
  });

  it("keeps the invitation and reports emailSent false when sending fails or SMTP is off", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const failing: Mailer = {
      send: () => Promise.reject(new Error("connection refused")),
    };
    const result = await invite(
      db,
      facilitator,
      { projectId, groupId: nursing, email: "a@example.test" },
      { baseUrl: BASE, mailer: failing, now: new Date() },
    );
    expect(result.ok && result.value.emailSent).toBe(false);
    const off = await inviteAddress(facilitator, projectId, nursing, "b@example.test");
    expect(off.emailSent).toBe(false);
    expect(await hasPendingInvitation(db, "a@example.test", new Date())).toBe(true);
  });

  it("refuses a group of another project", async () => {
    const { facilitator, projectId } = await setup();
    const other = await facilitatorWithProject(db, "other");
    const foreign = await groupId(db, other.projectId, "Nursing");
    const result = await invite(
      db,
      facilitator,
      { projectId, groupId: foreign, email: "a@example.test" },
      { baseUrl: BASE, mailer: null, now: new Date() },
    );
    expect(result).toEqual({ ok: false, error: "group_not_found" });
  });

  it("refuses a member of the project and an address with a pending invitation", async () => {
    const { facilitator, facilitatorEmail, projectId, nursing } = await setup();
    const input = { projectId, groupId: nursing };
    const deps = { baseUrl: BASE, mailer: null, now: new Date() };
    expect(await invite(db, facilitator, { ...input, email: facilitatorEmail }, deps)).toEqual({
      ok: false,
      error: "already_member",
    });
    await inviteAddress(facilitator, projectId, nursing, "a@example.test");
    expect(await invite(db, facilitator, { ...input, email: "A@example.test" }, deps)).toEqual({
      ok: false,
      error: "already_invited",
    });
  });

  it("invites again once the earlier invitation expired", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const past = new Date(Date.now() - 49 * HOUR);
    await inviteAddress(facilitator, projectId, nursing, "a@example.test", past);
    await inviteAddress(facilitator, projectId, nursing, "a@example.test");
  });

  it("refuses a participant (forbidden) and a non-member (not_found)", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const participant = await insertUser(db, "par");
    await inviteAddress(facilitator, projectId, nursing, emailOf(participant));
    await acceptInvitationsOnSignIn(db, participant, new Date());
    const outsider = await insertUser(db, "out");
    const input = { projectId, groupId: nursing, email: "x@example.test" };
    const deps = { baseUrl: BASE, mailer: null, now: new Date() };
    expect(await invite(db, participant, input, deps)).toEqual({ ok: false, error: "forbidden" });
    expect(await invite(db, outsider, input, deps)).toEqual({ ok: false, error: "not_found" });
    expect(await listInvitations(db, participant, projectId, deps)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await listInvitations(db, outsider, projectId, deps)).toEqual({
      ok: false,
      error: "not_found",
    });
    const revoke = { projectId, invitationId: "00000000-0000-4000-8000-000000000000" };
    expect(await revokeInvitation(db, participant, revoke)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await revokeInvitation(db, outsider, revoke)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await restoreInvitation(db, participant, revoke, deps)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await restoreInvitation(db, outsider, revoke, deps)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("restoreInvitation (undo of a revoke)", () => {
  async function restore(facilitator: string, projectId: string, invitationId: string) {
    return restoreInvitation(db, facilitator, { projectId, invitationId }, { now: new Date() });
  }

  it("makes a revoked invitation pending again, with the same link", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const created = await inviteAddress(facilitator, projectId, nursing, "a@example.test");
    const input = { projectId, invitationId: created.invitationId };
    await revokeInvitation(db, facilitator, input);
    expect(await restore(facilitator, projectId, created.invitationId)).toEqual({
      ok: true,
      value: null,
    });
    const listed = await listInvitations(db, facilitator, projectId, {
      baseUrl: BASE,
      now: new Date(),
    });
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.value).toEqual([
      expect.objectContaining({ id: created.invitationId, status: "pending", url: created.url }),
    ]);
    const logged = await db
      .selectFrom("activity_log")
      .select("action")
      .where("target_id", "=", created.invitationId)
      .orderBy("id")
      .execute();
    expect(logged.map((row) => row.action)).toEqual([
      "invitation_created",
      "invitation_revoked",
      "invitation_restored",
    ]);
  });

  it("refuses an invitation that is pending, expired, or of another project", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const pending = await inviteAddress(facilitator, projectId, nursing, "a@example.test");
    expect(await restore(facilitator, projectId, pending.invitationId)).toEqual({
      ok: false,
      error: "invitation_not_found",
    });
    const past = new Date(Date.now() - 49 * HOUR);
    const old = await inviteAddress(facilitator, projectId, nursing, "b@example.test", past);
    await db
      .updateTable("invitation")
      .set({ status: "canceled" })
      .where("id", "=", old.invitationId)
      .execute();
    expect(await restore(facilitator, projectId, old.invitationId)).toEqual({
      ok: false,
      error: "invitation_not_found",
    });
    const other = await facilitatorWithProject(db, "other");
    const foreign = await inviteAddress(
      other.userId,
      other.projectId,
      await groupId(db, other.projectId, "Nursing"),
      "c@example.test",
    );
    await revokeInvitation(db, other.userId, {
      projectId: other.projectId,
      invitationId: foreign.invitationId,
    });
    expect(await restore(facilitator, projectId, foreign.invitationId)).toEqual({
      ok: false,
      error: "invitation_not_found",
    });
  });

  it("refuses when the address was invited again after the revoke", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const first = await inviteAddress(facilitator, projectId, nursing, "a@example.test");
    await revokeInvitation(db, facilitator, { projectId, invitationId: first.invitationId });
    await inviteAddress(facilitator, projectId, nursing, "a@example.test");
    expect(await restore(facilitator, projectId, first.invitationId)).toEqual({
      ok: false,
      error: "already_invited",
    });
  });
});

describe("listInvitations and revokeInvitation", () => {
  it("lists each status, with a copyable link only for a pending invitation", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const pending = await inviteAddress(facilitator, projectId, nursing, "p@example.test");
    const expired = await inviteAddress(
      facilitator,
      projectId,
      nursing,
      "e@example.test",
      new Date(Date.now() - 49 * HOUR),
    );
    const revoked = await inviteAddress(facilitator, projectId, nursing, "r@example.test");
    await revokeInvitation(db, facilitator, { projectId, invitationId: revoked.invitationId });
    const joiner = await insertUser(db, "a");
    const accepted = await inviteAddress(facilitator, projectId, nursing, emailOf(joiner));
    await acceptInvitationsOnSignIn(db, joiner, new Date());
    const listed = await listInvitations(db, facilitator, projectId, {
      baseUrl: BASE,
      now: new Date(),
    });
    if (!listed.ok) throw new Error(listed.error);
    const byId = new Map(listed.value.map((row) => [row.id, row]));
    expect(byId.get(pending.invitationId)).toMatchObject({
      status: "pending",
      groupName: "Nursing",
      url: pending.url,
    });
    expect(byId.get(expired.invitationId)).toMatchObject({ status: "expired", url: null });
    expect(byId.get(revoked.invitationId)).toMatchObject({ status: "canceled", url: null });
    expect(byId.get(accepted.invitationId)).toMatchObject({ status: "accepted", url: null });
  });

  it("revokes only a pending invitation of the project", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const created = await inviteAddress(facilitator, projectId, nursing, "a@example.test");
    const input = { projectId, invitationId: created.invitationId };
    expect(await revokeInvitation(db, facilitator, input)).toEqual({ ok: true, value: null });
    expect(await revokeInvitation(db, facilitator, input)).toEqual({
      ok: false,
      error: "invitation_not_found",
    });
    const other = await facilitatorWithProject(db, "other");
    const foreign = await inviteAddress(
      other.userId,
      other.projectId,
      await groupId(db, other.projectId, "Nursing"),
      "b@example.test",
    );
    expect(
      await revokeInvitation(db, facilitator, { projectId, invitationId: foreign.invitationId }),
    ).toEqual({ ok: false, error: "invitation_not_found" });
  });
});

describe("invitationPreview", () => {
  it("shows the project name for a pending invitation only (a used or expired link is refused)", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const now = new Date();
    const joiner = await insertUser(db, "a");
    const created = await inviteAddress(facilitator, projectId, nursing, emailOf(joiner), now);
    expect(await invitationPreview(db, created.invitationId, now)).toEqual({
      projectName: "Blood pressure",
    });
    const later = new Date(now.getTime() + INVITATION_LIFETIME_SECONDS * 1000);
    expect(await invitationPreview(db, created.invitationId, later)).toBeNull();
    await acceptInvitationsOnSignIn(db, joiner, now);
    expect(await invitationPreview(db, created.invitationId, now)).toBeNull();
    expect(await invitationPreview(db, "no-such-invitation", now)).toBeNull();
  });
});

describe("acceptInvitationsOnSignIn", () => {
  it("makes the user participant, member of the group, and gives a rating code", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const userId = await insertUser(db, "a");
    const created = await inviteAddress(facilitator, projectId, nursing, emailOf(userId));
    expect(await acceptInvitationsOnSignIn(db, userId, new Date())).toBe(1);
    const member = await db
      .selectFrom("member")
      .innerJoin("rating_code", "rating_code.member_id", "member.id")
      .select(["member.role", "rating_code.project_id"])
      .where("member.userId", "=", userId)
      .executeTakeFirstOrThrow();
    expect(member).toEqual({ role: "participant", project_id: projectId });
    const teams = await db
      .selectFrom("teamMember")
      .innerJoin("team", "team.id", "teamMember.teamId")
      .select(["team.id", "team.memberCount"])
      .where("teamMember.userId", "=", userId)
      .execute();
    expect(teams).toEqual([{ id: nursing, memberCount: 1 }]);
    const invitation = await db
      .selectFrom("invitation")
      .select("status")
      .where("id", "=", created.invitationId)
      .executeTakeFirstOrThrow();
    expect(invitation.status).toBe("accepted");
    expect(await acceptInvitationsOnSignIn(db, userId, new Date())).toBe(0);
  });

  it("never grants the application role facilitator", async () => {
    const { facilitator, facilitatorEmail, projectId, nursing } = await setup();
    const userId = await insertUser(db, "a");
    await inviteAddress(facilitator, projectId, nursing, emailOf(userId));
    await acceptInvitationsOnSignIn(db, userId, new Date());
    expect(await userHasAppRole(db, userId, "facilitator")).toBe(false);
    expect(await db.selectFrom("app_role").select("email").execute()).toEqual([
      { email: facilitatorEmail },
    ]);
  });

  it("accepts nothing that expired or was revoked", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const userId = await insertUser(db, "a");
    const expired = await inviteAddress(
      facilitator,
      projectId,
      nursing,
      emailOf(userId),
      new Date(Date.now() - 49 * HOUR),
    );
    expect(await acceptInvitationsOnSignIn(db, userId, new Date())).toBe(0);
    const revoked = await inviteAddress(facilitator, projectId, nursing, emailOf(userId));
    await revokeInvitation(db, facilitator, { projectId, invitationId: revoked.invitationId });
    expect(await acceptInvitationsOnSignIn(db, userId, new Date())).toBe(0);
    expect(
      await db.selectFrom("member").select("id").where("userId", "=", userId).execute(),
    ).toEqual([]);
    const statuses = await db
      .selectFrom("invitation")
      .select(["id", "status"])
      .where("id", "in", [expired.invitationId, revoked.invitationId])
      .orderBy("createdAt")
      .execute();
    expect(statuses.map((row) => row.status)).toEqual(["pending", "canceled"]);
  });

  it("accepts nothing for an unverified address", async () => {
    const { facilitator, projectId, nursing } = await setup();
    await inviteAddress(facilitator, projectId, nursing, "u@example.test");
    await db
      .insertInto("user")
      .values({ id: "user-u", name: "", email: "u@example.test", emailVerified: false })
      .execute();
    expect(await acceptInvitationsOnSignIn(db, "user-u", new Date())).toBe(0);
  });

  it("keeps the role of a member who joined while the invitation was pending", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const userId = await insertUser(db, "a");
    await inviteAddress(facilitator, projectId, nursing, emailOf(userId));
    await db
      .insertInto("member")
      .values({
        id: "member-a",
        organizationId: projectId,
        userId,
        role: "facilitator",
        createdAt: new Date(),
      })
      .execute();
    expect(await acceptInvitationsOnSignIn(db, userId, new Date())).toBe(1);
    const member = await db
      .selectFrom("member")
      .select("role")
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow();
    expect(member.role).toBe("facilitator");
    expect(
      await db.selectFrom("teamMember").select("id").where("userId", "=", userId).execute(),
    ).toEqual([]);
    const code = await db
      .selectFrom("rating_code")
      .select("id")
      .where("member_id", "=", "member-a")
      .execute();
    expect(code).toHaveLength(1);
  });

  it("lets the facilitator of one project join another as a participant", async () => {
    const { facilitator, projectId } = await setup();
    const other = await facilitatorWithProject(db, "other");
    const patient = await groupId(db, projectId, "Patient");
    await inviteAddress(facilitator, projectId, patient, other.email);
    expect(await acceptInvitationsOnSignIn(db, other.userId, new Date())).toBe(1);
    const roles = await db
      .selectFrom("member")
      .select(["organizationId", "role"])
      .where("userId", "=", other.userId)
      .orderBy("role")
      .execute();
    expect(roles).toEqual([
      { organizationId: other.projectId, role: "facilitator" },
      { organizationId: projectId, role: "participant" },
    ]);
  });
});

describe("mayCreateAccount (PR1)", () => {
  it("allows an address with a pending invitation or an application role, nothing else", async () => {
    const { facilitator, projectId, nursing } = await setup();
    const now = new Date();
    expect(await mayCreateAccount(db, "nobody@example.test", now)).toBe(false);
    await inviteAddress(facilitator, projectId, nursing, "inv@example.test", now);
    expect(await mayCreateAccount(db, "INV@example.test", now)).toBe(true);
    const later = new Date(now.getTime() + INVITATION_LIFETIME_SECONDS * 1000);
    expect(await mayCreateAccount(db, "inv@example.test", later)).toBe(false);
    await grantAppRole(db, "admin@example.test", "administrator");
    expect(await mayCreateAccount(db, "admin@example.test", now)).toBe(true);
  });
});
