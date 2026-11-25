// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The session lifetime of PR1 (owner decision 2026-11-25) through the app's own session read:
// better-auth's idle expiry and daily extension, and our 30-day cap, on real PostgreSQL.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SESSION_MAX_DAYS } from "@/lib/sign-in";
import { createAuth } from "../auth.ts";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { parseEnv } from "../env.ts";
import { insertUser } from "../test-fixtures.ts";
import { readSession } from "./read.ts";

const BASE = "http://localhost:3000";
const DAY = 86_400_000;
const ENV = parseEnv({
  DATABASE_URL: "postgres://unused@localhost/unused",
  BETTER_AUTH_SECRET: "test-secret-that-is-at-least-32-characters-long",
  BETTER_AUTH_URL: BASE,
});

let db: Kysely<DB>;
let auth: ReturnType<typeof createAuth>;
let headers: Headers;
let userId: string;

/** Signs in through the magic link as a browser does and keeps its session cookie. */
async function signIn(): Promise<void> {
  userId = await insertUser(db, "tester");
  const link = new Promise<string>((resolve) => {
    auth = createAuth(ENV, db, {
      mailer: { send: async (message) => resolve(message.text.match(/https?:\/\/\S+/)?.[0] ?? "") },
      production: false,
      log: () => undefined,
    });
  });
  const email = (
    await db.selectFrom("user").select("email").where("id", "=", userId).executeTakeFirstOrThrow()
  ).email;
  await auth.handler(
    new Request(`${BASE}/api/auth/sign-in/magic-link`, {
      method: "POST",
      headers: { "content-type": "application/json", origin: BASE },
      body: JSON.stringify({ email, callbackURL: "/" }),
    }),
  );
  const confirm = new URL(await link);
  const verify = new URL(`/api/auth/magic-link/verify${confirm.search}`, BASE);
  const response = await auth.handler(new Request(verify, { headers: { origin: BASE } }));
  const cookie = (response.headers.get("set-cookie") ?? "").match(
    /[^\s;,]*session_token=[^;]+/,
  )?.[0];
  if (!cookie) throw new Error("no session cookie");
  headers = new Headers({ cookie });
}

async function session() {
  return db.selectFrom("session").selectAll().where("userId", "=", userId).executeTakeFirst();
}

beforeEach(async () => {
  db = await createTestDb();
  await signIn();
});

afterEach(async () => {
  await db.destroy();
});

describe("readSession", () => {
  it("reads a fresh session", async () => {
    expect((await readSession(auth, db, headers))?.user.id).toBe(userId);
  });

  it("sets the idle lifetime to 7 days at sign-in", async () => {
    const row = await session();
    const days = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(6.99);
    expect(days).toBeLessThanOrEqual(7);
  });

  it("extends a session used for more than a day, and leaves a session used today alone", async () => {
    const before = (await session())?.expiresAt.getTime() ?? 0;
    await readSession(auth, db, headers);
    expect((await session())?.expiresAt.getTime()).toBe(before);

    await db
      .updateTable("session")
      .set({ expiresAt: new Date(Date.now() + 5 * DAY) })
      .where("userId", "=", userId)
      .execute();
    await readSession(auth, db, headers);
    const days = (((await session())?.expiresAt.getTime() ?? 0) - Date.now()) / DAY;
    expect(days).toBeGreaterThan(6.99);
  });

  it("refuses a session unused for more than 7 days", async () => {
    await db
      .updateTable("session")
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where("userId", "=", userId)
      .execute();
    expect(await readSession(auth, db, headers)).toBeNull();
  });

  it("refuses a session 30 days after sign-in and deletes its row, even when used yesterday", async () => {
    await db
      .updateTable("session")
      .set({
        createdAt: new Date(Date.now() - 31 * DAY),
        updatedAt: new Date(Date.now() - DAY),
        expiresAt: new Date(Date.now() + 6 * DAY),
      })
      .where("userId", "=", userId)
      .execute();
    expect(await readSession(auth, db, headers)).toBeNull();
    expect(await session()).toBeUndefined();
    expect(await readSession(auth, db, headers)).toBeNull();
  });

  it("keeps a session 29 days after sign-in that is in use", async () => {
    await db
      .updateTable("session")
      .set({
        createdAt: new Date(Date.now() - 29 * DAY),
        expiresAt: new Date(Date.now() + 6 * DAY),
      })
      .where("userId", "=", userId)
      .execute();
    expect((await readSession(auth, db, headers))?.user.id).toBe(userId);
  });

  it("caps the session in the database, so better-auth's own session read ends it too", async () => {
    await db
      .updateTable("session")
      .set({
        createdAt: new Date(Date.now() - 31 * DAY),
        expiresAt: new Date(Date.now() + 6 * DAY),
      })
      .where("userId", "=", userId)
      .execute();
    const row = await session();
    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(
      (row?.createdAt.getTime() ?? 0) + SESSION_MAX_DAYS * DAY,
    );
    expect(await auth.api.getSession({ headers })).toBeNull();
  });

  it("never extends a session past 30 days after sign-in", async () => {
    await db
      .updateTable("session")
      .set({
        createdAt: new Date(Date.now() - 29 * DAY),
        updatedAt: new Date(Date.now() - 2 * DAY),
        expiresAt: new Date(Date.now() + DAY),
      })
      .where("userId", "=", userId)
      .execute();
    expect((await readSession(auth, db, headers))?.user.id).toBe(userId);
    const row = await session();
    expect(row?.expiresAt.getTime()).toBeLessThanOrEqual(
      (row?.createdAt.getTime() ?? 0) + SESSION_MAX_DAYS * DAY,
    );
  });

  it("refuses a request without a session cookie", async () => {
    expect(await readSession(auth, db, new Headers())).toBeNull();
  });
});
