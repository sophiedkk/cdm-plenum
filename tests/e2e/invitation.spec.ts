// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The invitation link (PR3): accessible in both languages (Q-ACC-1, Q-I18N-1), and an invited
// address joins its project by signing in.
import { randomUUID } from "node:crypto";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  type Locale,
  MESSAGES,
  seedInvitation,
  seedProject,
  signIn,
  test,
} from "./fixtures.ts";
import { tabTo } from "./keyboard.ts";

/** The project name the seed gives every project (src/server/test-fixtures.ts). */
const PROJECT_NAME = "Blood pressure";

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`invitation page in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("is axe-clean and works with the keyboard only", async ({ page, db }) => {
      const { invitationId } = await seedInvitation(db, await seedProject(db));
      await page.goto(`/invite/${invitationId}`);
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1, name: text.invite_title })).toBeVisible();
      await expect(page.getByText(PROJECT_NAME)).toBeVisible();
      await expectAxeClean(page);

      const signInLink = page.getByRole("link", { name: text.invite_sign_in });
      await tabTo(page, signInLink);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
    });

    test("shows an unknown invitation accessibly", async ({ page }) => {
      await page.goto(`/invite/${randomUUID()}`);
      await expect(page.getByRole("alert")).toHaveText(text.invite_invalid);
      await expectAxeClean(page);
    });
  });
}

test("an invited address joins the project by signing in", async ({ page, db }) => {
  const project = await seedProject(db);
  const { invitationId, email } = await seedInvitation(db, project);

  await page.goto(`/invite/${invitationId}`);
  await page.getByRole("link", { name: MESSAGES.en.invite_sign_in }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
  await signIn(page, email);

  const member = await db
    .selectFrom("member")
    .innerJoin("user", "user.id", "member.userId")
    .select("member.role")
    .where("member.organizationId", "=", project.projectId)
    .where("user.email", "=", email)
    .executeTakeFirst();
  expect(member?.role).toBe("participant");

  await page.goto(`/invite/${invitationId}`);
  await expect(page.getByRole("alert")).toHaveText(MESSAGES.en.invite_invalid);
});
