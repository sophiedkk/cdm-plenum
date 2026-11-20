// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The administration page (AD1, AD2): accessible in both languages and with the keyboard only
// (Q-ACC-1, Q-I18N-1); an administrator grants the facilitator right and deactivates an
// account; a user without the right never sees the page (Q-SEC-1).
import { randomBytes } from "node:crypto";
import type { Kysely } from "kysely";
import { grantAppRole, userHasAppRole } from "../../src/server/admin/app-roles.ts";
import type { DB } from "../../src/server/db/schema.gen.ts";
import {
  addressOf,
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedParticipant,
  seedProject,
  signIn,
  test,
  uniqueName,
} from "./fixtures.ts";
import { tabTo } from "./keyboard.ts";
import { countMessages } from "./mailpit.ts";
import { appUrl } from "./run-env.ts";

/** An address with the administrator right; the account appears at its first sign-in. */
async function seedAdministrator(db: Kysely<DB>): Promise<string> {
  const email = addressOf(uniqueName("admin"));
  await grantAppRole(db, email, "administrator");
  return email;
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`administration page in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("is axe-clean and grants the facilitator right with the keyboard only", async ({
      page,
      db,
    }) => {
      const admin = await seedAdministrator(db);
      await signIn(page, admin, locale);
      await page.goto("/admin");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1, name: text.admin_title })).toBeVisible();
      await expectAxeClean(page);

      const email = addressOf(uniqueName("facilitator"));
      const field = page.getByLabel(text.admin_grant_email_label, { exact: true });
      await expectHydrated(field);
      await tabTo(page, field, 40);
      await page.keyboard.type(email);
      await tabTo(page, page.getByLabel(text.admin_grant_role_label, { exact: true }));
      await page.keyboard.press("Enter");
      await expect(page.getByRole("listbox")).toBeVisible();
      await page.getByRole("option", { name: text.admin_right_facilitator }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("listbox")).toBeHidden();
      await tabTo(page, page.getByRole("button", { name: text.admin_grant_submit }));
      await page.keyboard.press("Enter");

      const row = page.getByRole("row").filter({ hasText: email });
      await expect(row).toBeVisible();
      await expect(row.getByText(text.admin_account_missing)).toBeVisible();
      await expectAxeClean(page);
      await expect.poll(() => hasRight(db, email)).toBe(true);
    });
  });
}

async function hasRight(db: Kysely<DB>, email: string): Promise<boolean> {
  const row = await db
    .selectFrom("app_role")
    .select("role")
    .where("email", "=", email)
    .where("role", "=", "facilitator")
    .executeTakeFirst();
  return row !== undefined;
}

test("an administrator grants the facilitator right, and the holder may create a project", async ({
  page,
  context,
  db,
}) => {
  const text = MESSAGES.en;
  const admin = await seedAdministrator(db);
  const project = await seedProject(db);
  const participant = await seedParticipant(db, project);
  await signIn(page, admin);
  await page.goto("/admin");
  await page.getByLabel(text.admin_grant_email_label, { exact: true }).fill(participant);
  await page.getByLabel(text.admin_grant_role_label, { exact: true }).click();
  await page.getByRole("option", { name: text.admin_right_facilitator }).click();
  await page.getByRole("button", { name: text.admin_grant_submit }).click();
  const granted = text.admin_right_granted
    .replace("{email}", participant)
    .replace("{right}", text.admin_right_facilitator);
  await expect(page.getByText(granted)).toBeVisible();

  const user = await db
    .selectFrom("user")
    .select("id")
    .where("email", "=", participant)
    .executeTakeFirstOrThrow();
  expect(await userHasAppRole(db, user.id, "facilitator")).toBe(true);

  await context.clearCookies();
  await signIn(page, participant);
  await expect(page.getByRole("link", { name: text.projects_new })).toBeVisible();
});

test("an administrator deactivates an account, which then cannot sign in", async ({
  page,
  context,
  db,
}) => {
  const text = MESSAGES.en;
  const admin = await seedAdministrator(db);
  const participant = await seedParticipant(db, await seedProject(db));
  await signIn(page, admin);
  await page.goto("/admin");
  const row = page.getByRole("row").filter({ hasText: participant });
  await row.getByRole("button", { name: text.admin_deactivate }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toBeVisible();
  await expectAxeClean(page);
  await dialog.getByRole("button", { name: text.admin_deactivate_submit }).click();
  await expect(dialog).toBeHidden();
  await expect(row.getByText(text.admin_status_deactivated)).toBeVisible();

  // The activity log names the action in words, filtered by it.
  await page.goto("/admin?action=account_deactivated");
  const log = page.getByRole("table", { name: text.admin_activity_caption });
  await expect(
    log.getByRole("row").filter({ hasText: text.admin_action_account_deactivated }).first(),
  ).toBeVisible();
  await expect(log).not.toContainText("account_deactivated");
  await expectAxeClean(page);

  await context.clearCookies();
  await page.goto("/sign-in");
  const field = page.getByLabel(text.sign_in_email_label);
  await expectHydrated(field);
  await field.fill(participant);
  await page.getByRole("button", { name: text.sign_in_submit }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: text.sign_in_check_inbox_title }),
  ).toBeVisible();
  // The link e-mail is sent before the page answers, so none has arrived by now.
  expect(await countMessages(participant)).toBe(0);
});

test("a user without the administrator right is sent to their projects", async ({ page, db }) => {
  const project = await seedProject(db);
  await signIn(page, project.facilitator.email);
  await page.goto("/admin");
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
});

test("the activity log names actions and projects, a page at a time, in English and Dutch", async ({
  browser,
  db,
}) => {
  const admin = await seedAdministrator(db);
  const project = await seedProject(db);
  const projectName = uniqueName("Project");
  await db
    .updateTable("organization")
    .set({ name: projectName })
    .where("id", "=", project.projectId)
    .execute();
  // Dated far ahead, so these 30 entries are the newest whatever other specs log meanwhile.
  await db
    .insertInto("activity_log")
    .values(
      Array.from({ length: 30 }, (_, second) => ({
        action: "export_mind_map",
        project_id: project.projectId,
        occurred_at: new Date(Date.UTC(2100, 0, 1, 0, 0, second)),
      })),
    )
    .execute();
  for (const locale of ["en", "nl"] as const satisfies Locale[]) {
    const text = MESSAGES[locale];
    const [a, b, c] = randomBytes(3);
    // axe needs a page of its own context.
    const context = await browser.newContext({
      baseURL: appUrl(),
      locale: BROWSER_LOCALE[locale],
      extraHTTPHeaders: { "X-Forwarded-For": `10.${a}.${b}.${c}` },
    });
    const page = await context.newPage();
    await signIn(page, admin, locale);
    await page.goto("/admin");
    const log = page.getByRole("table", { name: text.admin_activity_caption });
    const rows = log.locator("tbody > tr");
    await expect(rows).toHaveCount(25);
    await expect(rows.first()).toContainText(text.admin_action_export_mind_map);
    await expect(rows.first()).toContainText(projectName);
    await expect(log).not.toContainText("export_mind_map");
    await expect(log).not.toContainText(project.projectId);
    const pages = page.getByRole("navigation", { name: text.admin_activity_pages_label });
    const pageWord = (n: number) =>
      text.admin_activity_page.split("{pages}")[0]?.replace("{page}", String(n)) ?? "";
    await expect(pages).toContainText(pageWord(1));
    await expectAxeClean(page);

    const next = pages.getByRole("link", { name: text.admin_activity_next });
    await expectHydrated(next);
    await next.click();
    await expect(page).toHaveURL((url) => url.searchParams.get("page") === "2");
    await expect(pages).toContainText(pageWord(2));
    await expect(rows.first()).toContainText(projectName);
    await expect(pages.getByRole("link", { name: text.admin_activity_previous })).toBeVisible();
    await expectAxeClean(page);
    await context.close();
  }
});
