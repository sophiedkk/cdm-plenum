// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The administration page (AD1, AD2, Q-SEC-1) on real PostgreSQL, with the negative test: a user
// without the administrator right gets `forbidden` from every function.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { APP_ROLE_KEYS } from "../db/migrations/0003_access.ts";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { facilitatorWithProject, insertUser } from "../test-fixtures.ts";
import { grantAppRole, userHasAppRole } from "./app-roles.ts";
import {
  deactivateAccount,
  grantRole,
  isDeactivated,
  isDeactivatedEmail,
  listAccounts,
  listActivity,
  listAppRoles,
  reactivateAccount,
  revokeRole,
} from "./queries.ts";
import { ACTIVITY_PAGE_SIZE, APP_ROLE_INPUTS, activityInput } from "./schemas.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

const NOW = new Date("2026-11-19T12:00:00Z");

async function administrator(name = "admin"): Promise<string> {
  const id = await insertUser(db, name);
  await grantAppRole(db, `${name}@example.test`, "administrator");
  return id;
}

async function insertSession(userId: string): Promise<void> {
  await db
    .insertInto("session")
    .values({
      id: `session-${userId}`,
      token: `token-${userId}`,
      userId,
      expiresAt: new Date(Date.now() + 3_600_000),
      updatedAt: new Date(),
    })
    .execute();
}

describe("access (Q-SEC-1)", () => {
  it("refuses every function to a user without the administrator right", async () => {
    const { userId: facilitator } = await facilitatorWithProject(db);
    const target = await insertUser(db, "target");
    const forbidden = { ok: false, error: "forbidden" };
    const role = { email: "x@example.test", role: "facilitator" } as const;
    expect(await listAppRoles(db, facilitator)).toEqual(forbidden);
    expect(await grantRole(db, facilitator, role)).toEqual(forbidden);
    expect(await revokeRole(db, facilitator, role)).toEqual(forbidden);
    expect(await listAccounts(db, facilitator)).toEqual(forbidden);
    expect(await deactivateAccount(db, facilitator, { userId: target }, NOW)).toEqual(forbidden);
    expect(await reactivateAccount(db, facilitator, { userId: target })).toEqual(forbidden);
    expect(await listActivity(db, facilitator, {})).toEqual(forbidden);
    expect(await db.selectFrom("app_role").select("email").execute()).toEqual([
      { email: "fac@example.test" },
    ]);
    expect(await isDeactivated(db, target)).toBe(false);
  });
});

describe("application rights (AD1)", () => {
  it("lists the rights by address, with whether an account exists", async () => {
    const admin = await administrator();
    await grantAppRole(db, "later@example.test", "facilitator");
    await grantAppRole(db, "admin@example.test", "facilitator");
    expect(await listAppRoles(db, admin)).toEqual({
      ok: true,
      value: [
        { email: "admin@example.test", roles: ["administrator", "facilitator"], hasAccount: true },
        { email: "later@example.test", roles: ["facilitator"], hasAccount: false },
      ],
    });
  });

  it("grants and revokes both rights, and logs the administrator as the actor", async () => {
    const admin = await administrator();
    const other = await insertUser(db, "other");
    const done = { ok: true, value: null };
    expect(
      await grantRole(db, admin, { email: "Other@Example.test", role: "facilitator" }),
    ).toEqual(done);
    expect(
      await grantRole(db, admin, { email: "other@example.test", role: "administrator" }),
    ).toEqual(done);
    expect(await userHasAppRole(db, other, "facilitator")).toBe(true);
    expect(await userHasAppRole(db, other, "administrator")).toBe(true);
    expect(
      await revokeRole(db, admin, { email: "other@example.test", role: "facilitator" }),
    ).toEqual(done);
    expect(
      await revokeRole(db, admin, { email: "other@example.test", role: "administrator" }),
    ).toEqual(done);
    expect(await userHasAppRole(db, other, "facilitator")).toBe(false);
    expect(await userHasAppRole(db, other, "administrator")).toBe(false);
    const logged = await db
      .selectFrom("activity_log")
      .select(["action", "actor_user_id", "target_type", "target_id"])
      .where("actor_user_id", "=", admin)
      .orderBy("occurred_at")
      .orderBy("id")
      .execute();
    expect(logged.map((row) => [row.action, row.target_type, row.target_id])).toEqual([
      ["app_role_granted", "app_role:facilitator", other],
      ["app_role_granted", "app_role:administrator", other],
      ["app_role_revoked", "app_role:facilitator", other],
      ["app_role_revoked", "app_role:administrator", other],
    ]);
  });

  it("refuses to revoke the administrator right from yourself (own_account)", async () => {
    const admin = await administrator();
    await grantAppRole(db, "admin@example.test", "facilitator");
    expect(
      await revokeRole(db, admin, { email: "Admin@example.test", role: "administrator" }),
    ).toEqual({ ok: false, error: "own_account" });
    expect(await userHasAppRole(db, admin, "administrator")).toBe(true);
    expect(
      await revokeRole(db, admin, { email: "admin@example.test", role: "facilitator" }),
    ).toEqual({ ok: true, value: null });
  });
});

describe("deactivateAccount and reactivateAccount (AD1)", () => {
  it("deactivates an account, ends its sessions and logs it by id", async () => {
    const admin = await administrator();
    const target = await insertUser(db, "target");
    await insertSession(target);
    await insertSession(admin);
    expect(await deactivateAccount(db, admin, { userId: target }, NOW)).toEqual({
      ok: true,
      value: null,
    });
    expect(await isDeactivated(db, target)).toBe(true);
    expect(await isDeactivatedEmail(db, "Target@example.test")).toBe(true);
    const sessions = await db.selectFrom("session").select("userId").execute();
    expect(sessions).toEqual([{ userId: admin }]);
    const accounts = await listAccounts(db, admin);
    if (!accounts.ok) throw new Error(accounts.error);
    expect(accounts.value.find((row) => row.id === target)?.deactivatedAt).toBe(NOW.toISOString());
    expect(accounts.value.find((row) => row.id === admin)?.deactivatedAt).toBeNull();

    expect(await deactivateAccount(db, admin, { userId: target }, new Date())).toEqual({
      ok: true,
      value: null,
    });
    expect(await reactivateAccount(db, admin, { userId: target })).toEqual({
      ok: true,
      value: null,
    });
    expect(await isDeactivated(db, target)).toBe(false);
    const logged = await db
      .selectFrom("activity_log")
      .select(["action", "target_id"])
      .where("target_type", "=", "user")
      .orderBy("occurred_at")
      .orderBy("id")
      .execute();
    expect(logged).toEqual([
      { action: "account_deactivated", target_id: target },
      { action: "account_reactivated", target_id: target },
    ]);
  });

  it("refuses to deactivate yourself (own_account) and an unknown account", async () => {
    const admin = await administrator();
    expect(await deactivateAccount(db, admin, { userId: admin }, NOW)).toEqual({
      ok: false,
      error: "own_account",
    });
    expect(await isDeactivated(db, admin)).toBe(false);
    expect(await deactivateAccount(db, admin, { userId: "user-missing" }, NOW)).toEqual({
      ok: false,
      error: "account_not_found",
    });
    expect(await reactivateAccount(db, admin, { userId: "user-missing" })).toEqual({
      ok: false,
      error: "account_not_found",
    });
  });
});

describe("listActivity (AD2)", () => {
  it("lists the newest entries first, by action, with ids and the actor's name only", async () => {
    const admin = await administrator();
    await db.updateTable("user").set({ name: "Ada Admin" }).where("id", "=", admin).execute();
    const { userId: facilitator, projectId } = await facilitatorWithProject(db);
    await grantRole(db, admin, { email: "new@example.test", role: "facilitator" });

    const all = await listActivity(db, admin, {});
    if (!all.ok) throw new Error(all.error);
    expect(all.value.entries[0]).toMatchObject({
      action: "app_role_granted",
      actorUserId: admin,
      actorName: "Ada Admin",
      targetType: "app_role:facilitator",
      targetId: null,
    });
    const times = all.value.entries.map((entry) => entry.occurredAt);
    expect(times).toEqual([...times].sort().reverse());
    expect(all.value.actions).toEqual(["app_role_granted", "project_created"]);
    expect(JSON.stringify(all.value)).not.toContain("@example.test");

    const created = await listActivity(db, admin, { action: "project_created" });
    if (!created.ok) throw new Error(created.error);
    expect(created.value.entries).toEqual([
      expect.objectContaining({
        action: "project_created",
        actorUserId: facilitator,
        actorName: "",
        projectId,
        projectName: "Blood pressure",
        targetType: "project",
        targetId: projectId,
      }),
    ]);
  });

  it("shows the log a page at a time, newest first, and the last page for one past it", async () => {
    const admin = await administrator();
    await db
      .insertInto("activity_log")
      .values(
        Array.from({ length: ACTIVITY_PAGE_SIZE * 2 + 3 }, (_, index) => ({
          action: "signed_in",
          actor_user_id: admin,
          occurred_at: new Date(NOW.getTime() + index * 1000),
        })),
      )
      .execute();
    const pageOf = async (page?: number) => {
      // The administrator right is logged too; the filter keeps to the inserted entries.
      const action = "signed_in";
      const result = await listActivity(
        db,
        admin,
        page === undefined ? { action } : { action, page },
      );
      if (!result.ok) throw new Error(result.error);
      return result.value;
    };
    const first = await pageOf();
    expect([first.page, first.pages, first.entries.length]).toEqual([1, 3, ACTIVITY_PAGE_SIZE]);
    const third = await pageOf(3);
    expect([third.page, third.entries.length]).toEqual([3, 3]);
    const seen = [first, await pageOf(2), third].flatMap((log) => log.entries.map((e) => e.id));
    expect(new Set(seen).size).toBe(ACTIVITY_PAGE_SIZE * 2 + 3);
    expect(first.entries[0]?.occurredAt).toBe(new Date(NOW.getTime() + 52_000).toISOString());
    expect(await pageOf(9)).toMatchObject({ page: 3, pages: 3 });
  });

  it("counts the pages of the filtered action only", async () => {
    const admin = await administrator();
    await facilitatorWithProject(db);
    const created = await listActivity(db, admin, { action: "project_created" });
    expect(created.ok && [created.value.page, created.value.pages]).toEqual([1, 1]);
    const none = await listActivity(db, admin, { action: "round_opened" });
    expect(none.ok && [none.value.entries, none.value.pages]).toEqual([[], 1]);
  });

  it("refuses a page below 1 or a fraction before the handler runs", () => {
    for (const page of [0, -1, 1.5]) {
      expect(activityInput.safeParse({ page }).success).toBe(false);
    }
    expect(activityInput.safeParse({ page: 2 }).success).toBe(true);
  });
});

describe("the role input", () => {
  it("allows exactly the application roles of migration 0003", () => {
    expect([...APP_ROLE_INPUTS]).toEqual([...APP_ROLE_KEYS]);
  });
});
