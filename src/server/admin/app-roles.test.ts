// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Application roles (AD1, owner decision 2026-11-19) and the grant command on real PostgreSQL.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { emailOf, insertUser } from "../test-fixtures.ts";
import {
  grantAppRole,
  hasAnyAppRole,
  normalizeEmail,
  revokeAppRole,
  userHasAppRole,
} from "./app-roles.ts";
import { parseGrantArgs, runGrant } from "./grant.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

describe("grantAppRole and revokeAppRole", () => {
  it("grants once, stores the address in lower case and reports a second grant", async () => {
    expect(await grantAppRole(db, " First@Example.test ", "facilitator")).toBe("granted");
    expect(await grantAppRole(db, "first@example.test", "facilitator")).toBe("already_granted");
    const rows = await db.selectFrom("app_role").select(["email", "role"]).execute();
    expect(rows).toEqual([{ email: "first@example.test", role: "facilitator" }]);
  });

  it("keeps administrator and facilitator apart", async () => {
    const id = await insertUser(db, "a");
    await grantAppRole(db, emailOf(id), "administrator");
    expect(await userHasAppRole(db, id, "administrator")).toBe(true);
    expect(await userHasAppRole(db, id, "facilitator")).toBe(false);
    expect(await hasAnyAppRole(db, emailOf(id).toUpperCase())).toBe(true);
    expect(await hasAnyAppRole(db, "b@example.test")).toBe(false);
  });

  it("revokes, and reports a role that was not granted", async () => {
    await grantAppRole(db, "a@example.test", "facilitator");
    expect(await revokeAppRole(db, "a@example.test", "facilitator")).toBe("revoked");
    expect(await revokeAppRole(db, "a@example.test", "facilitator")).toBe("not_granted");
    expect(await hasAnyAppRole(db, "a@example.test")).toBe(false);
  });

  it("logs the account id, never the address (Q-PRIV-2)", async () => {
    const id = await insertUser(db, "a");
    await grantAppRole(db, emailOf(id), "facilitator");
    await revokeAppRole(db, emailOf(id), "facilitator");
    await grantAppRole(db, "nobody@example.test", "administrator");
    const rows = await db
      .selectFrom("activity_log")
      .select(["action", "target_type", "target_id"])
      .orderBy("occurred_at")
      .orderBy("id")
      .execute();
    expect(rows).toEqual([
      { action: "app_role_granted", target_type: "app_role:facilitator", target_id: id },
      { action: "app_role_revoked", target_type: "app_role:facilitator", target_id: id },
      { action: "app_role_granted", target_type: "app_role:administrator", target_id: null },
    ]);
  });

  it("is refused by the database for an unknown role or an address not in lower case", async () => {
    await expect(
      db
        .transaction()
        .execute((trx) =>
          trx.insertInto("app_role").values({ email: "a@example.test", role: "owner" }).execute(),
        ),
    ).rejects.toThrow(/app_role_role_check/);
    await expect(
      db
        .transaction()
        .execute((trx) =>
          trx
            .insertInto("app_role")
            .values({ email: "A@example.test", role: "facilitator" })
            .execute(),
        ),
    ).rejects.toThrow(/app_role_email_check/);
  });

  it("normalizes like better-auth stores user.email", () => {
    expect(normalizeEmail("  Mixed@Example.TEST ")).toBe("mixed@example.test");
  });
});

describe("parseGrantArgs", () => {
  it("reads grant and revoke, administrator by default and facilitator with the flag", () => {
    expect(parseGrantArgs(["grant", "a@example.test"])).toEqual({
      action: "grant",
      email: "a@example.test",
      role: "administrator",
    });
    expect(parseGrantArgs(["revoke", "a@example.test", "--facilitator"])).toEqual({
      action: "revoke",
      email: "a@example.test",
      role: "facilitator",
    });
  });

  it("refuses a missing or malformed address, an unknown action, flag or extra argument", () => {
    expect(parseGrantArgs(["grant"])).toBeNull();
    expect(parseGrantArgs(["grant", "not-an-address"])).toBeNull();
    expect(parseGrantArgs(["delete", "a@example.test"])).toBeNull();
    expect(parseGrantArgs(["grant", "a@example.test", "--owner"])).toBeNull();
    expect(parseGrantArgs(["grant", "a@example.test", "b@example.test"])).toBeNull();
  });
});

describe("runGrant", () => {
  it("prints the outcome and the role, never the address", async () => {
    const lines: string[] = [];
    const out = (line: string) => lines.push(line);
    const command = { email: "a@example.test", role: "facilitator" } as const;
    expect(await runGrant(db, { ...command, action: "grant" }, out)).toBe(0);
    expect(await runGrant(db, { ...command, action: "revoke" }, out)).toBe(0);
    expect(await runGrant(db, { ...command, action: "revoke" }, out)).toBe(0);
    expect(lines).toEqual([
      "granted: facilitator",
      "revoked: facilitator",
      "not_granted: facilitator",
    ]);
  });
});
