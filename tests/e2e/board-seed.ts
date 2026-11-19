// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Seeds and helpers of the scope and board specs: elements and a scope statement written through
// the same functions the server functions call, and a sign-in in the page's language.
import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { addElement } from "../../src/server/elements/queries.ts";
import { addElementInput } from "../../src/server/elements/schemas.ts";
import { updateScope } from "../../src/server/scope/queries.ts";
import { expect, type Locale, requestSignInLink } from "./fixtures.ts";

/** The user id of an address the seeds created. */
export async function userIdOf(db: Kysely<DB>, email: string): Promise<string> {
  const row = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", email)
    .executeTakeFirstOrThrow();
  return row.id;
}

/** Adds an element as `userId`; returns its id. */
export async function seedElement(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  fields: { name: string; description?: string },
): Promise<string> {
  const added = await addElement(db, userId, addElementInput.parse({ projectId, ...fields }));
  if (!added.ok) throw new Error(`addElement refused: ${added.error}`);
  return added.value.elementId;
}

/** Writes the three texts of the scope statement as the facilitator. */
export async function seedScope(
  db: Kysely<DB>,
  facilitatorId: string,
  projectId: string,
  texts: { concept: string; useCases: string; outOfScope: string },
): Promise<void> {
  const result = await updateScope(db, facilitatorId, { projectId, ...texts });
  if (!result.ok) throw new Error(`updateScope refused: ${result.error}`);
}

/** Signs in on the sign-in page in `locale`, then opens `path`. */
export async function signInTo(page: Page, email: string, locale: Locale, path: string) {
  await page.goto(await requestSignInLink(page, email, locale));
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
  await page.goto(path);
}
