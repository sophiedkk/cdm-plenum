// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The person menu (ADR 0018): language, theme and sign out under the person's name. The theme
// is light, dark or the system setting; the choice holds across a reload, the system choice
// follows the browser's colour scheme, and the dark theme keeps AA contrast (Q-ACC-1) on the
// pages a participant and a facilitator use most. The language choice renders the next page in
// that language.
import type { Page } from "@playwright/test";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedProject,
  signIn,
  test,
} from "./fixtures.ts";

type Text = (typeof MESSAGES)[Locale];

/** Opens the person menu, the button that starts with "Signed in as". */
async function openPersonMenu(page: Page, text: Text): Promise<void> {
  const trigger = page.getByRole("button", { name: new RegExp(`^${text.shell_signed_in_as} `) });
  await expectHydrated(trigger);
  await trigger.click();
  await expect(page.getByRole("menu")).toBeVisible();
}

async function choose(page: Page, text: Text, option: string): Promise<void> {
  await openPersonMenu(page, text);
  await page
    .getByRole("group", { name: text.shell_theme_label })
    .getByRole("menuitemradio", { name: option })
    .click();
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`theme switch in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], colorScheme: "dark" });
    const text = MESSAGES[locale];

    test("follows the system, keeps a choice across a reload, and stays axe-clean in dark", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      await signIn(page, project.facilitator.email, locale);
      const html = page.locator("html");

      // Without a choice the theme follows the browser, which prefers dark here.
      await expect(html).toHaveAttribute("data-theme", "dark");
      await expectAxeClean(page);

      await choose(page, text, text.shell_theme_light);
      await expect(html).toHaveAttribute("data-theme", "light");
      await page.reload();
      await expect(html).toHaveAttribute("data-theme", "light");

      await choose(page, text, text.shell_theme_dark);
      await expect(html).toHaveAttribute("data-theme", "dark");
      await page.goto(`/projects/${project.projectId}/board`);
      await expect(html).toHaveAttribute("data-theme", "dark");
      await expectAxeClean(page);
      await page.goto(`/projects/${project.projectId}/scope`);
      await expectAxeClean(page);

      // Back to the system setting: the theme follows the browser again when it changes.
      await choose(page, text, text.shell_theme_system);
      await page.emulateMedia({ colorScheme: "light" });
      await expect(html).toHaveAttribute("data-theme", "light");
    });
  });
}

test("the person menu holds language, theme and sign out, and changes the language", async ({
  page,
  db,
}) => {
  const en = MESSAGES.en;
  const nl = MESSAGES.nl;
  const project = await seedProject(db);
  await signIn(page, project.facilitator.email, "en");
  await openPersonMenu(page, en);
  const menu = page.getByRole("menu");
  await expect(menu.getByRole("group", { name: en.shell_language_label })).toBeVisible();
  await expect(menu.getByRole("group", { name: en.shell_theme_label })).toBeVisible();
  await expect(menu.getByRole("menuitem", { name: en.shell_sign_out })).toBeVisible();
  // Administration stays in the main navigation, for administrators only.
  await expect(page.getByRole("link", { name: en.shell_nav_admin })).toHaveCount(0);
  await expectAxeClean(page);

  await menu.getByRole("menuitemradio", { name: en.shell_language_nl }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "nl");
  await expect(page.getByRole("heading", { level: 1, name: nl.projects_title })).toBeVisible();
  await openPersonMenu(page, nl);
  await expect(page.getByRole("menuitemradio", { name: nl.shell_language_nl })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expectAxeClean(page);
  await page.getByRole("menuitem", { name: nl.shell_sign_out }).click();
  await expect(page).toHaveURL((url) => url.pathname === "/sign-in");
});
