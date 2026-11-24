// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The people of the development sign-in page and its refusals, on real PostgreSQL.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { grantAppRole } from "../admin/app-roles.ts";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import {
  emailOf,
  facilitatorWithProject,
  insertUser,
  joinedParticipant,
} from "../test-fixtures.ts";
import { devSignInAddress, devSignInPeople } from "./queries.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

async function deactivate(userId: string): Promise<void> {
  await db
    .updateTable("user")
    .set({ deactivated_at: new Date() })
    .where("id", "=", userId)
    .execute();
}

describe("devSignInPeople", () => {
  it("refuses as not found when the setting is off", async () => {
    await insertUser(db, "someone");
    expect(await devSignInPeople(db, false)).toEqual({ ok: false, error: "not_found" });
  });

  it("puts application roles first, then the first stakeholder group, then no group", async () => {
    const admin = await insertUser(db, "admin");
    await grantAppRole(db, emailOf(admin), "administrator");
    await grantAppRole(db, emailOf(admin), "facilitator");
    const { userId: facilitator, projectId } = await facilitatorWithProject(db, "fac");
    const nurse = await joinedParticipant(db, facilitator, projectId, "Nursing", "nurse");
    const gp = await joinedParticipant(db, facilitator, projectId, "Primary care", "gp");
    const loner = await insertUser(db, "loner");

    const result = await devSignInPeople(db, true);
    if (!result.ok) throw new Error(result.error);
    const outline = result.value.map((group) => ({
      heading: group.kind === "role" ? group.role : group.kind === "group" ? group.name : "none",
      people: group.people.map((person) => person.id),
    }));
    expect(outline).toEqual([
      { heading: "administrator", people: [admin] },
      { heading: "facilitator", people: [facilitator] },
      { heading: "Nursing", people: [nurse] },
      { heading: "Primary care", people: [gp] },
      { heading: "none", people: [loner] },
    ]);
    expect(result.value[0]?.people[0]).toEqual({ id: admin, name: "", email: emailOf(admin) });
  });

  it("names a person under the group they joined first", async () => {
    const { userId: facilitator, projectId } = await facilitatorWithProject(db, "fac");
    const nurse = await joinedParticipant(db, facilitator, projectId, "Nursing", "nurse");
    const other = await facilitatorWithProject(db, "fac2");
    const later = await db
      .selectFrom("team")
      .select("id")
      .where("organizationId", "=", other.projectId)
      .where("name", "=", "Architecture")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("teamMember")
      .values({
        id: `tm-${nurse}`,
        teamId: later.id,
        userId: nurse,
        createdAt: new Date(Date.now() + 60_000),
      })
      .execute();

    const result = await devSignInPeople(db, true);
    if (!result.ok) throw new Error(result.error);
    const headings = result.value.flatMap((group) =>
      group.kind === "group" && group.people.some((person) => person.id === nurse)
        ? [group.name]
        : [],
    );
    expect(headings).toEqual(["Nursing"]);
  });

  it("leaves out deactivated accounts", async () => {
    const active = await insertUser(db, "active");
    const gone = await insertUser(db, "gone");
    await deactivate(gone);
    const result = await devSignInPeople(db, true);
    if (!result.ok) throw new Error(result.error);
    const ids = result.value.flatMap((group) => group.people.map((person) => person.id));
    expect(ids).toContain(active);
    expect(ids).not.toContain(gone);
  });
});

describe("devSignInAddress", () => {
  it("refuses as not found when the setting is off", async () => {
    const id = await insertUser(db, "someone");
    expect(await devSignInAddress(db, false, id)).toEqual({ ok: false, error: "not_found" });
  });

  it("returns the address of an active account", async () => {
    const id = await insertUser(db, "someone");
    expect(await devSignInAddress(db, true, id)).toEqual({ ok: true, value: emailOf(id) });
  });

  it("refuses an unknown or deactivated account", async () => {
    const id = await insertUser(db, "gone");
    await deactivate(id);
    expect(await devSignInAddress(db, true, id)).toEqual({
      ok: false,
      error: "account_not_found",
    });
    expect(await devSignInAddress(db, true, "user-missing")).toEqual({
      ok: false,
      error: "account_not_found",
    });
  });
});
