// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The session user of the app shell (AD1) on real PostgreSQL.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { grantAppRole } from "../admin/app-roles.ts";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { emailOf, insertUser } from "../test-fixtures.ts";
import { sessionUser } from "./queries.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

describe("sessionUser", () => {
  it("returns the user without application roles", async () => {
    const id = await insertUser(db, "plain");
    expect(await sessionUser(db, id)).toEqual({
      id,
      name: "",
      email: emailOf(id),
      appRoles: [],
    });
  });

  it("returns the application roles granted to the user's address, in a fixed order", async () => {
    const id = await insertUser(db, "both");
    await grantAppRole(db, emailOf(id), "facilitator");
    await grantAppRole(db, emailOf(id), "administrator");
    expect((await sessionUser(db, id))?.appRoles).toEqual(["administrator", "facilitator"]);
  });

  it("does not pick up the roles of another address", async () => {
    const id = await insertUser(db, "one");
    const two = await insertUser(db, "two");
    await grantAppRole(db, emailOf(two), "administrator");
    expect((await sessionUser(db, id))?.appRoles).toEqual([]);
  });

  it("returns null for an unknown user", async () => {
    expect(await sessionUser(db, "user-missing")).toBeNull();
  });
});
