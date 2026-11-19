// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Invented accounts and projects for database tests. Addresses use the reserved `.test` domain.
import type { Kysely } from "kysely";
import { grantAppRole } from "./admin/app-roles.ts";
import type { DB } from "./db/schema.gen.ts";
import { createProject } from "./projects/queries.ts";

export const NOW = new Date("2026-11-19T12:00:00Z");

/** Inserts a verified user `<name>@example.test` and returns its id. */
export async function insertUser(db: Kysely<DB>, name: string): Promise<string> {
  const id = `user-${name}`;
  await db
    .insertInto("user")
    .values({ id, name: "", email: `${name}@example.test`, emailVerified: true })
    .execute();
  return id;
}

/** A facilitator with the application role and one new project; returns both ids. */
export async function facilitatorWithProject(
  db: Kysely<DB>,
  name = "fac",
): Promise<{ userId: string; projectId: string }> {
  const userId = await insertUser(db, name);
  await grantAppRole(db, `${name}@example.test`, "facilitator");
  const created = await createProject(db, userId, { name: "Blood pressure" }, "en");
  if (!created.ok) throw new Error(`createProject refused: ${created.error}`);
  return { userId, projectId: created.value.projectId };
}

/** The id of the project's group with the given name. */
export async function groupId(db: Kysely<DB>, projectId: string, name: string): Promise<string> {
  const row = await db
    .selectFrom("team")
    .select("id")
    .where("organizationId", "=", projectId)
    .where("name", "=", name)
    .executeTakeFirstOrThrow();
  return row.id;
}
