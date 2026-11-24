// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The development sign-in through better-auth's own verification on real PostgreSQL: the link
// signs in as with e-mail, sends nothing, and nobody gets one with DEV_SIGN_IN off.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAuth, DEV_SIGN_IN_DELIVERY } from "../auth.ts";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { devSignInEnabled, parseEnv } from "../env.ts";
import type { MailMessage } from "../mail.ts";
import { emailOf, insertUser } from "../test-fixtures.ts";
import { DEV_SIGN_IN_TARGET, devSignInLink } from "./link.ts";

const BASE = "http://localhost:3000";
const SETTINGS = {
  DATABASE_URL: "postgres://unused@localhost/unused",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
  BETTER_AUTH_URL: BASE,
};
const ON = parseEnv({ ...SETTINGS, DEV_SIGN_IN: "true" });
const OFF = parseEnv(SETTINGS);

let db: Kysely<DB>;
let sent: MailMessage[];

beforeEach(async () => {
  db = await createTestDb();
  sent = [];
});

afterEach(async () => {
  await db.destroy();
});

function authWith(env: typeof ON) {
  return createAuth(env, db, {
    mailer: { send: async (message) => void sent.push(message) },
    production: false,
    log: () => undefined,
  });
}

/** Opens a link; returns where it redirects and whether it set a session cookie. */
async function open(auth: ReturnType<typeof authWith>, path: string) {
  const response = await auth.handler(new Request(`${BASE}${path}`, { headers: { origin: BASE } }));
  return {
    location: response.headers.get("location") ?? "",
    session: (response.headers.get("set-cookie") ?? "").includes("session_token="),
  };
}

async function signIns(userId: string): Promise<number> {
  const rows = await db
    .selectFrom("activity_log")
    .select("id")
    .where("actor_user_id", "=", userId)
    .where("action", "=", "signed_in")
    .execute();
  return rows.length;
}

describe("devSignInLink", () => {
  it("signs in through the magic link verification, logs it and sends no e-mail", async () => {
    const auth = authWith(ON);
    const id = await insertUser(db, "tester");
    const link = await devSignInLink(auth, db, devSignInEnabled(ON), id, new Headers());
    if (!link.ok) throw new Error(link.error);
    expect(link.value).toMatch(/^\/api\/auth\/magic-link\/verify\?token=/);
    expect(sent).toEqual([]);

    expect(await open(auth, link.value)).toEqual({
      location: `${BASE}${DEV_SIGN_IN_TARGET}`,
      session: true,
    });
    expect(await signIns(id)).toBe(1);
    // Single use, as every sign-in link.
    expect((await open(auth, link.value)).session).toBe(false);
  });

  it("refuses as not found with the setting off and makes no link", async () => {
    const auth = authWith(OFF);
    const id = await insertUser(db, "tester");
    expect(await devSignInLink(auth, db, devSignInEnabled(OFF), id, new Headers())).toEqual({
      ok: false,
      error: "not_found",
    });
    const tokens = await db
      .selectFrom("verification")
      .select("id")
      .where("identifier", "like", "magic-link:%")
      .execute();
    expect(tokens).toEqual([]);
  });

  it("gives no link from an app whose own setting is off, even when asked as on", async () => {
    const auth = authWith(OFF);
    const id = await insertUser(db, "tester");
    expect(await devSignInLink(auth, db, true, id, new Headers())).toEqual({
      ok: false,
      error: "account_not_found",
    });
    expect(sent).toEqual([]);
  });

  it("refuses a deactivated account", async () => {
    const auth = authWith(ON);
    const id = await insertUser(db, "gone");
    await db.updateTable("user").set({ deactivated_at: new Date() }).where("id", "=", id).execute();
    expect(await devSignInLink(auth, db, true, id, new Headers())).toEqual({
      ok: false,
      error: "account_not_found",
    });
  });

  it("cannot be reached over HTTP: a delivery value in the request is ignored", async () => {
    const auth = authWith(ON);
    const id = await insertUser(db, "tester");
    const response = await auth.handler(
      new Request(`${BASE}/api/auth/sign-in/magic-link`, {
        method: "POST",
        headers: { "content-type": "application/json", origin: BASE },
        body: JSON.stringify({
          email: emailOf(id),
          callbackURL: "/",
          metadata: { [DEV_SIGN_IN_DELIVERY]: "https://attacker.example.test/" },
        }),
      }),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: true });
    // The link went by e-mail, as without the value.
    expect(sent.map((message) => message.to)).toEqual([emailOf(id)]);
  });
});
