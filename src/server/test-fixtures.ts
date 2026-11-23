// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Invented accounts and projects for database tests. Addresses use the reserved `.test` domain.
// NOTE: the unit tests share one database and run in parallel transactions. Each fixture account
// gets a random suffix, so two tests never wait on the same user or app role key and deadlock.
import { randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import type { ProjectPhase } from "@/lib/project-phases";
import { grantAppRole } from "./admin/app-roles.ts";
import type { DB } from "./db/schema.gen.ts";
import { acceptInvitationsOnSignIn } from "./invitations/acceptance.ts";
import { invite } from "./invitations/queries.ts";
import { createProject } from "./projects/queries.ts";

export const NOW = new Date("2026-11-19T12:00:00Z");

/** The address of a fixture user: `<name>-<suffix>@example.test` for id `user-<name>-<suffix>`. */
export function emailOf(userId: string): string {
  return `${userId.replace(/^user-/, "")}@example.test`;
}

/**
 * Inserts a verified user `<name>-<suffix>@example.test` with id `user-<name>-<suffix>` and
 * returns the id; `emailOf` gives the address.
 */
export async function insertUser(db: Kysely<DB>, name: string): Promise<string> {
  const id = `user-${name}-${randomBytes(4).toString("hex")}`;
  await db
    .insertInto("user")
    .values({ id, name: "", email: emailOf(id), emailVerified: true })
    .execute();
  return id;
}

/** A facilitator with the application role and one new project; returns the ids and address. */
export async function facilitatorWithProject(
  db: Kysely<DB>,
  name = "fac",
): Promise<{ userId: string; projectId: string; email: string }> {
  const userId = await insertUser(db, name);
  const email = emailOf(userId);
  await grantAppRole(db, email, "facilitator");
  const created = await createProject(db, userId, { name: "Blood pressure" }, "en");
  if (!created.ok) throw new Error(`createProject refused: ${created.error}`);
  return { userId, projectId: created.value.projectId, email };
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

/**
 * Invites a new user `<name>-<suffix>@example.test` into the named stakeholder group and accepts
 * it, so the user is a participant who has joined; returns the user id (`emailOf` the address).
 */
export async function joinedParticipant(
  db: Kysely<DB>,
  facilitatorId: string,
  projectId: string,
  groupName: string,
  name: string,
): Promise<string> {
  const userId = await insertUser(db, name);
  const invited = await invite(
    db,
    facilitatorId,
    { projectId, groupId: await groupId(db, projectId, groupName), email: emailOf(userId) },
    { baseUrl: "http://localhost:3000", mailer: null, now: new Date() },
  );
  if (!invited.ok) throw new Error(`invite refused: ${invited.error}`);
  await acceptInvitationsOnSignIn(db, userId, new Date());
  return userId;
}

/** Inserts a candidate element on the project's board and returns its id. */
export async function insertElement(
  db: Kysely<DB>,
  projectId: string,
  name: string,
): Promise<string> {
  const row = await db
    .insertInto("element")
    .values({ project_id: projectId, name, description: `Description of ${name}` })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/**
 * Puts the project in `phase` straight in the database, for tests whose setup needs the steps of
 * that phase (PR9, PR10). The facilitator's moves are tested in projects/phase.test.ts.
 */
export async function setPhase(
  db: Kysely<DB>,
  projectId: string,
  phase: ProjectPhase,
): Promise<void> {
  await db.updateTable("project").set({ phase }).where("id", "=", projectId).execute();
}

/**
 * Inserts an element on the list from an existing model (EL7): a CKM source model of the
 * project, created once, with one source element, linked to a new candidate element. Returns
 * the element id.
 */
export async function insertImportedElement(
  db: Kysely<DB>,
  projectId: string,
  name: string,
): Promise<string> {
  const existing = await db
    .selectFrom("source_model")
    .select("id")
    .where("project_id", "=", projectId)
    .where("kind", "=", "ckm")
    .executeTakeFirst();
  const modelId =
    existing?.id ??
    (
      await db
        .insertInto("source_model")
        .values({
          project_id: projectId,
          kind: "ckm",
          status: "imported",
          title: "Test archetype",
          ckm_archetype_id: "openEHR-EHR-OBSERVATION.test.v1",
          ckm_cid: "1013.1.1",
          ckm_revision: "1.0.0",
          imported_at: new Date(),
        })
        .returning("id")
        .executeTakeFirstOrThrow()
    ).id;
  const count = await db
    .selectFrom("source_element")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("source_model_id", "=", modelId)
    .executeTakeFirstOrThrow();
  const position = Number(count.count);
  const source = await db
    .insertInto("source_element")
    .values({
      source_model_id: modelId,
      position,
      path: `/data[at0001]/items[at${1000 + position}]`,
      name,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  const elementId = await insertElement(db, projectId, name);
  await db
    .insertInto("element_source_link")
    .values({ element_id: elementId, source_element_id: source.id })
    .execute();
  return elementId;
}
