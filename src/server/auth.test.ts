// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Sign-in by e-mail link through better-auth's own HTTP handler on real PostgreSQL (PR1, PR3,
// ADR 0004): the acceptance criteria of #2, end to end, with a mailer that keeps the messages.
import { randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SIGN_UP_REFUSED } from "@/lib/sign-in";
import { grantAppRole } from "./admin/app-roles.ts";
import {
  createAuth,
  ORGANIZATION_PATHS,
  SIGN_IN_RATE_LIMIT,
  SIGN_IN_RATE_LIMITED_PATHS,
} from "./auth.ts";
import type { DB } from "./db/schema.gen.ts";
import { createTestDb } from "./db/test-db.ts";
import { parseEnv } from "./env.ts";
import { invite, revokeInvitation } from "./invitations/queries.ts";
import type { MailMessage } from "./mail.ts";
import { facilitatorWithProject, groupId } from "./test-fixtures.ts";

const BASE = "http://localhost:3000";
const ENV = parseEnv({
  DATABASE_URL: "postgres://unused@localhost/unused",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
  BETTER_AUTH_URL: BASE,
});

let db: Kysely<DB>;
let sent: MailMessage[];
let logged: string[];
let auth: ReturnType<typeof createAuth>;

beforeEach(async () => {
  db = await createTestDb();
  sent = [];
  logged = [];
  auth = createAuth(ENV, db, {
    mailer: { send: async (message) => void sent.push(message) },
    production: false,
    log: (line) => logged.push(line),
  });
});

afterEach(async () => {
  await db.destroy();
});

/** Asks for a sign-in link as the sign-in page does; returns the HTTP status. */
async function requestLink(email: string): Promise<number> {
  const response = await auth.handler(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, callbackURL: "/", errorCallbackURL: "/sign-in" }),
    }),
  );
  return response.status;
}

/** The sign-in link in the last e-mail to `email`. */
function linkFor(email: string): string {
  const message = sent.findLast((m) => m.to === email);
  const url = message?.text.match(/https?:\/\/\S+/)?.[0];
  if (!url) throw new Error(`no sign-in link for ${email}`);
  return url;
}

/** Opens a sign-in link; returns where it redirects and whether it set a session cookie. */
async function openLink(url: string): Promise<{ location: string; session: boolean }> {
  const response = await auth.handler(new Request(url, { headers: { origin: BASE } }));
  return {
    location: response.headers.get("location") ?? "",
    session: (response.headers.get("set-cookie") ?? "").includes("session_token="),
  };
}

async function invited(email: string) {
  const { userId, projectId } = await facilitatorWithProject(db);
  const nursing = await groupId(db, projectId, "Nursing");
  const result = await invite(
    db,
    userId,
    { projectId, groupId: nursing, email },
    { baseUrl: BASE, mailer: null, now: new Date() },
  );
  if (!result.ok) throw new Error(result.error);
  return { facilitator: userId, projectId, nursing, invitationId: result.value.invitationId };
}

async function userId(email: string): Promise<string | undefined> {
  const row = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirst();
  return row?.id;
}

describe("sign-in by e-mail link", () => {
  it("creates the account of an invited address and accepts the invitation (#2)", async () => {
    const { projectId, nursing } = await invited("new@example.test");
    expect(await requestLink("New@Example.test")).toBe(200);
    const result = await openLink(linkFor("New@Example.test"));
    expect(result).toEqual({ location: `${BASE}/`, session: true });
    const id = await userId("new@example.test");
    expect(id).toBeDefined();
    const member = await db
      .selectFrom("member")
      .innerJoin("rating_code", "rating_code.member_id", "member.id")
      .select(["member.role", "member.organizationId"])
      .where("member.userId", "=", id ?? "")
      .executeTakeFirstOrThrow();
    expect(member).toEqual({ role: "participant", organizationId: projectId });
    const team = await db
      .selectFrom("teamMember")
      .select("teamId")
      .where("userId", "=", id ?? "")
      .executeTakeFirstOrThrow();
    expect(team.teamId).toBe(nursing);
  });

  it("refuses sign-up for an address without invitation or grant, and sends nothing (#2)", async () => {
    expect(await requestLink("stranger@example.test")).toBe(200);
    expect(sent).toEqual([]);
    expect(await userId("stranger@example.test")).toBeUndefined();
  });

  it("refuses sign-up when the invitation was revoked after the link was sent", async () => {
    const { facilitator, projectId, invitationId } = await invited("new@example.test");
    await requestLink("new@example.test");
    await revokeInvitation(db, facilitator, { projectId, invitationId });
    const result = await openLink(linkFor("new@example.test"));
    expect(result.session).toBe(false);
    expect(new URL(result.location).searchParams.get("error")).toBe(SIGN_UP_REFUSED);
    expect(new URL(result.location).pathname).toBe("/sign-in");
    expect(await userId("new@example.test")).toBeUndefined();
  });

  it("refuses sign-up when the invitation expired after the link was sent (#2)", async () => {
    const { invitationId } = await invited("new@example.test");
    await requestLink("new@example.test");
    await db
      .updateTable("invitation")
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where("id", "=", invitationId)
      .execute();
    const result = await openLink(linkFor("new@example.test"));
    expect(new URL(result.location).searchParams.get("error")).toBe(SIGN_UP_REFUSED);
    expect(await userId("new@example.test")).toBeUndefined();
  });

  it("lets an address with an administrator grant create its account (AD1)", async () => {
    await grantAppRole(db, "first@example.test", "facilitator");
    await requestLink("first@example.test");
    expect((await openLink(linkFor("first@example.test"))).session).toBe(true);
    expect(await userId("first@example.test")).toBeDefined();
  });

  it("lets an existing account sign in again, and accepts a used link only once", async () => {
    await invited("new@example.test");
    await requestLink("new@example.test");
    const link = linkFor("new@example.test");
    expect((await openLink(link)).session).toBe(true);
    const reused = await openLink(link);
    expect(reused.session).toBe(false);
    expect(new URL(reused.location).searchParams.get("error")).toBe("INVALID_TOKEN");
    await requestLink("new@example.test");
    expect(sent).toHaveLength(2);
    expect((await openLink(linkFor("new@example.test"))).session).toBe(true);
  });

  it("writes the link to the log without SMTP in development", async () => {
    auth = createAuth(ENV, db, {
      mailer: null,
      production: false,
      log: (line) => logged.push(line),
    });
    await invited("new@example.test");
    await requestLink("new@example.test");
    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain(`${BASE}/api/auth/magic-link/verify?token=`);
    expect(logged[0]).not.toContain("new@example.test");
  });
});

describe("deactivated accounts (AD1)", () => {
  async function deactivate(email: string): Promise<void> {
    await db
      .updateTable("user")
      .set({ deactivated_at: new Date() })
      .where("email", "=", email)
      .execute();
  }

  it("sends no link to a deactivated account and answers the same", async () => {
    await grantAppRole(db, "gone@example.test", "facilitator");
    await requestLink("gone@example.test");
    expect((await openLink(linkFor("gone@example.test"))).session).toBe(true);
    await deactivate("gone@example.test");
    sent = [];
    expect(await requestLink("gone@example.test")).toBe(200);
    expect(sent).toEqual([]);
  });

  it("refuses a link sent before the account was deactivated, without a session", async () => {
    await grantAppRole(db, "gone@example.test", "facilitator");
    await requestLink("gone@example.test");
    expect((await openLink(linkFor("gone@example.test"))).session).toBe(true);
    await requestLink("gone@example.test");
    const link = linkFor("gone@example.test");
    await deactivate("gone@example.test");
    const result = await openLink(link);
    expect(result.session).toBe(false);
    expect(new URL(result.location).pathname).toBe("/sign-in");
    expect(new URL(result.location).searchParams.get("error")).toBeTruthy();
    const id = await userId("gone@example.test");
    const sessions = await db
      .selectFrom("session")
      .select("id")
      .where("userId", "=", id ?? "")
      .execute();
    expect(sessions).toHaveLength(1);
  });

  it("logs every sign-in by account id (AD2)", async () => {
    await grantAppRole(db, "first@example.test", "facilitator");
    await requestLink("first@example.test");
    await openLink(linkFor("first@example.test"));
    const id = await userId("first@example.test");
    const rows = await db
      .selectFrom("activity_log")
      .select(["actor_user_id", "target_id"])
      .where("action", "=", "signed_in")
      .execute();
    expect(rows).toEqual([{ actor_user_id: id, target_id: null }]);
  });
});

describe("the sign-in link rate limit (#14)", () => {
  /** A client address no other test uses: better-auth keeps one limit store per process. */
  function clientAddress(): string {
    const [a, b, c] = randomBytes(3);
    return `10.${a}.${b}.${c}`;
  }

  async function requestFrom(ip: string, email: string): Promise<number> {
    const response = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": ip },
        body: JSON.stringify({ email, callbackURL: "/" }),
      }),
    );
    return response.status;
  }

  beforeEach(() => {
    auth = createAuth(ENV, db, {
      mailer: { send: async (message) => void sent.push(message) },
      production: true,
      log: () => {},
    });
  });

  it("lets 30 link requests from one address through in a minute and refuses the next", async () => {
    const ip = clientAddress();
    const statuses: number[] = [];
    for (let request = 0; request <= SIGN_IN_RATE_LIMIT.max; request += 1) {
      statuses.push(await requestFrom(ip, `class${request}@example.test`));
    }
    expect(SIGN_IN_RATE_LIMIT).toEqual({ window: 60, max: 30 });
    expect(statuses.slice(0, SIGN_IN_RATE_LIMIT.max)).toEqual(
      Array(SIGN_IN_RATE_LIMIT.max).fill(200),
    );
    expect(statuses.at(-1)).toBe(429);
    expect(await requestFrom(clientAddress(), "other@example.test")).toBe(200);
  });

  it("applies the same limit to opening links", async () => {
    const ip = clientAddress();
    const statuses: number[] = [];
    for (let request = 0; request <= SIGN_IN_RATE_LIMIT.max; request += 1) {
      const response = await auth.handler(
        new Request(`${BASE}/api/auth/magic-link/verify?token=wrong${request}`, {
          headers: { origin: BASE, "x-forwarded-for": ip },
        }),
      );
      statuses.push(response.status);
    }
    expect(statuses.slice(0, SIGN_IN_RATE_LIMIT.max)).not.toContain(429);
    expect(statuses.at(-1)).toBe(429);
    expect([...SIGN_IN_RATE_LIMITED_PATHS]).toEqual(["/sign-in/magic-link", "/magic-link/verify"]);
  });
});

describe("the organization plugin", () => {
  it("has every HTTP endpoint disabled, so writes go through cdm-plenum's own services", async () => {
    expect(ORGANIZATION_PATHS.length).toBeGreaterThan(10);
    for (const path of [
      "/organization/create",
      "/organization/invite-member",
      "/organization/create-team",
    ]) {
      expect(ORGANIZATION_PATHS).toContain(path);
      const response = await auth.handler(
        new Request(`${BASE}/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE },
          body: JSON.stringify({ name: "X", slug: "x" }),
        }),
      );
      expect(response.status).toBe(404);
    }
  });

  it("refuses a server-side write through auth.api as well", async () => {
    await expect(
      auth.api.createOrganization({ body: { name: "X", slug: "x", userId: "nobody" } }),
    ).rejects.toThrow();
    expect(await db.selectFrom("organization").select("id").execute()).toEqual([]);
  });
});
