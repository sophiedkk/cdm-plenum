// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The development sign-in page (DEV_SIGN_IN, which playwright.config.ts sets): sign in as a
// person with one button, and switch to another person from the person menu.
import type { Page } from "@playwright/test";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedParticipant,
  seedProject,
  sessionEmail,
  test,
} from "./fixtures.ts";

type Text = (typeof MESSAGES)[Locale];

/** Opens /dev/sign-in and signs in as the account with `email`; lands on the projects. */
async function signInFromPage(page: Page, text: Text, email: string): Promise<void> {
  await expect(
    page.getByRole("heading", { level: 1, name: text.shell_dev_sign_in_title }),
  ).toBeVisible();
  const person = page.getByRole("button", { name: email });
  await expectHydrated(person);
  await person.click();
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
  expect(await sessionEmail(page)).toBe(email);
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`development sign-in in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("signs in as a participant, then switches to the facilitator", async ({ page, db }) => {
      const project = await seedProject(db);
      const participant = await seedParticipant(db, project);

      await page.goto("/dev/sign-in");
      await expect(page.getByText(text.shell_dev_sign_in_note)).toBeVisible();
      await expectAxeClean(page);
      await signInFromPage(page, text, participant);
      await expect(page.locator(`a[href="/projects/${project.projectId}"]`).first()).toBeVisible();
      await expectAxeClean(page);

      const trigger = page.getByRole("button", {
        name: new RegExp(`^${text.shell_signed_in_as} `),
      });
      await expectHydrated(trigger);
      await trigger.click();
      await page.getByRole("menuitem", { name: text.shell_dev_sign_in_switch }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/dev/sign-in");
      await expectAxeClean(page);
      await signInFromPage(page, text, project.facilitator.email);
    });
  });
}
