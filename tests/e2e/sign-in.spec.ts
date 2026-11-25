// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The sign-in page (PR1, ADR 0004): accessible in both languages (Q-ACC-1, Q-I18N-1), the full
// sign-in through the e-mail link, and a link that works once.
import {
  addressOf,
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  requestConfirmLink,
  seedParticipant,
  seedProject,
  sessionEmail,
  signIn,
  test,
  uniqueName,
} from "./fixtures.ts";
import { tabTo } from "./keyboard.ts";

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`sign-in page in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("is axe-clean and works with the keyboard only", async ({ page }) => {
      await page.goto("/sign-in");
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 1, name: text.sign_in_title })).toBeVisible();
      await expectAxeClean(page);

      const field = page.getByLabel(text.sign_in_email_label);
      await expectHydrated(field);
      await tabTo(page, field);
      // No invitation: the page answers the same and no e-mail goes out.
      await page.keyboard.type(addressOf(uniqueName("nobody")));
      const submit = page.getByRole("button", { name: text.sign_in_submit });
      await tabTo(page, submit);
      await page.keyboard.press("Enter");
      await expect(
        page.getByRole("heading", { level: 1, name: text.sign_in_check_inbox_title }),
      ).toBeVisible();
      await expect(page.getByRole("status")).toBeVisible();
      await expectAxeClean(page);
    });

    test("the confirmation page is axe-clean and names no account", async ({ page, db }) => {
      const project = await seedProject(db);
      await page.goto(await requestConfirmLink(page, project.facilitator.email, locale));
      await expect(page.getByRole("heading", { level: 1, name: text.sign_in_title })).toBeVisible();
      await expect(page.getByRole("button", { name: text.sign_in_confirm_button })).toBeVisible();
      await expect(page.locator("body")).not.toContainText(project.facilitator.email);
      await expectAxeClean(page);
    });

    test("shows a refused link accessibly", async ({ page }) => {
      await page.goto("/sign-in?error=INVALID_TOKEN");
      await expect(page.getByRole("alert")).toHaveText(text.sign_in_error_invalid_link);
      await expectAxeClean(page);
    });
  });
}

test("a facilitator signs in through the e-mail link", async ({ page, db }) => {
  const project = await seedProject(db);
  await signIn(page, project.facilitator.email);
});

test("a participant who joined through an invitation signs in", async ({ page, db }) => {
  const participant = await seedParticipant(db, await seedProject(db));
  await signIn(page, participant);
});

test("a scanner that opens the link leaves it usable until the button is pressed", async ({
  page,
  db,
}) => {
  const project = await seedProject(db);
  const link = await requestConfirmLink(page, project.facilitator.email);
  // A mail scanner fetches the link without a browser, more than once.
  for (let attempt = 0; attempt < 2; attempt++) {
    expect((await page.request.get(link)).ok()).toBe(true);
  }
  expect(await sessionEmail(page)).toBeNull();

  await page.goto(link);
  const button = page.getByRole("button", { name: MESSAGES.en.sign_in_confirm_button });
  await expectHydrated(button);
  await button.click();
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
  expect(await sessionEmail(page)).toBe(project.facilitator.email);
});

test("a used sign-in link is refused", async ({ page, db }) => {
  const project = await seedProject(db);
  const link = await requestConfirmLink(page, project.facilitator.email);
  await page.goto(link);
  await page.getByRole("button", { name: MESSAGES.en.sign_in_confirm_button }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
  expect(await sessionEmail(page)).toBe(project.facilitator.email);

  await page.context().clearCookies();
  await page.goto(link);
  await page.getByRole("button", { name: MESSAGES.en.sign_in_confirm_button }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
  await expect(page.getByRole("alert")).toHaveText(MESSAGES.en.sign_in_error_invalid_link);
  expect(await sessionEmail(page)).toBeNull();
});

test("a confirmation page without a token shows the refused-link message", async ({ page }) => {
  await page.goto("/sign-in/confirm");
  await expect(page.getByRole("alert")).toHaveText(MESSAGES.en.sign_in_error_invalid_link);
  await expectAxeClean(page);
});
