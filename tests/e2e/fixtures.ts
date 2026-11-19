// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The e2e `test` with a database fixture, the seed helpers and the sign-in helper. Seeds go
// straight into this run's database through the same functions the unit tests use, with
// invented addresses under example.test that are new in every test.
import { randomBytes } from "node:crypto";
import { test as base, expect, type Locator, type Page } from "@playwright/test";
import { Kysely, PostgresDialect } from "kysely";
import pg from "pg";
import en from "../../messages/en.json" with { type: "json" };
import nl from "../../messages/nl.json" with { type: "json" };
import type { DB } from "../../src/server/db/schema.gen.ts";
import { invite } from "../../src/server/invitations/queries.ts";
import { facilitatorWithProject, joinedParticipant } from "../../src/server/test-fixtures.ts";
import { linkIn, takeMessage } from "./mailpit.ts";
import { appUrl, runDatabaseUrl } from "./run-env.ts";

export { expectAxeClean } from "./axe.ts";
export { expect };

export type Locale = "en" | "nl";

/** The message catalogues, so the specs find elements by the text a user reads. */
export const MESSAGES = { en, nl } as const;

/** The browser locale that makes the app answer in `locale` (Accept-Language). */
export const BROWSER_LOCALE = { en: "en-GB", nl: "nl-NL" } as const satisfies Record<
  Locale,
  string
>;

/** A name no other test uses; the address is `<name>@example.test`. */
export function uniqueName(prefix: string): string {
  return `${prefix}-${randomBytes(4).toString("hex")}`;
}

export function addressOf(name: string): string {
  return `${name}@example.test`;
}

export interface SeededProject {
  projectId: string;
  facilitator: { userId: string; email: string };
}

/** A facilitator, granted through the grant command's function, with one new project. */
export async function seedProject(db: Kysely<DB>): Promise<SeededProject> {
  const name = uniqueName("facilitator");
  const { userId, projectId } = await facilitatorWithProject(db, name);
  return { projectId, facilitator: { userId, email: addressOf(name) } };
}

async function firstGroup(
  db: Kysely<DB>,
  projectId: string,
): Promise<{ id: string; name: string }> {
  return db
    .selectFrom("team")
    .select(["id", "name"])
    .where("organizationId", "=", projectId)
    .orderBy("name")
    .limit(1)
    .executeTakeFirstOrThrow();
}

/** A participant who joined the project through an invitation; returns the address. */
export async function seedParticipant(db: Kysely<DB>, project: SeededProject): Promise<string> {
  const name = uniqueName("participant");
  const group = await firstGroup(db, project.projectId);
  await joinedParticipant(db, project.facilitator.userId, project.projectId, group.name, name);
  return addressOf(name);
}

/** A pending invitation for a new address, without e-mail; returns its id and the address. */
export async function seedInvitation(
  db: Kysely<DB>,
  project: SeededProject,
): Promise<{ invitationId: string; email: string }> {
  const email = addressOf(uniqueName("invitee"));
  const group = await firstGroup(db, project.projectId);
  const invited = await invite(
    db,
    project.facilitator.userId,
    { projectId: project.projectId, groupId: group.id, email },
    { baseUrl: appUrl(), mailer: null, now: new Date() },
  );
  if (!invited.ok) throw new Error(`invite refused: ${invited.error}`);
  return { invitationId: invited.value.invitationId, email };
}

/**
 * Waits until React has hydrated `element`, so its handlers are attached. Before that a form
 * submits natively and the click is lost. React marks a hydrated node with `__reactProps$<id>`.
 */
export async function expectHydrated(element: Locator): Promise<void> {
  await expect
    .poll(() =>
      element.evaluate((node) => Object.keys(node).some((key) => key.startsWith("__reactProps$"))),
    )
    .toBe(true);
}

/** Asks for a sign-in link on /sign-in and returns the link from the e-mail in Mailpit. */
export async function requestSignInLink(
  page: Page,
  email: string,
  locale: Locale = "en",
): Promise<string> {
  const text = MESSAGES[locale];
  await page.goto("/sign-in");
  const field = page.getByLabel(text.sign_in_email_label);
  await expectHydrated(field);
  await field.fill(email);
  await page.getByRole("button", { name: text.sign_in_submit }).click();
  await expect(page.getByRole("heading", { name: text.sign_in_check_inbox_title })).toBeVisible();
  return linkIn(await takeMessage(email), appUrl());
}

/** Signs in with the e-mail link and returns once the app has landed on its start page. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto(await requestSignInLink(page, email));
  await expect(page).toHaveURL((url) => url.pathname === "/");
  expect(await sessionEmail(page)).toBe(email);
}

/** The address of the signed-in user, or `null` without a session. */
export async function sessionEmail(page: Page): Promise<string | null> {
  const response = await page.request.get("/api/auth/get-session");
  expect(response.ok()).toBe(true);
  const session = (await response.json()) as { user?: { email: string } } | null;
  return session?.user?.email ?? null;
}

interface WorkerFixtures {
  db: Kysely<DB>;
}

export const test = base.extend<object, WorkerFixtures>({
  // NOTE: better-auth reads the client address from a single-value X-Forwarded-For, as behind
  // the reverse proxy (docs/deployment.md). A new address per test keeps the magic link rate
  // limit (5 requests per 60 s per address) from failing parallel tests.
  extraHTTPHeaders: async ({ extraHTTPHeaders }, use) => {
    const [a, b, c] = randomBytes(3);
    await use({ ...extraHTTPHeaders, "X-Forwarded-For": `10.${a}.${b}.${c}` });
  },
  db: [
    // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern
    async ({}, use) => {
      const db = new Kysely<DB>({
        dialect: new PostgresDialect({
          pool: new pg.Pool({ connectionString: runDatabaseUrl(), max: 2 }),
        }),
      });
      await use(db);
      await db.destroy();
    },
    { scope: "worker" },
  ],
});
