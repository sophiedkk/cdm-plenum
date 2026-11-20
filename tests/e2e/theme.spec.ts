// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The theme switch: light, dark or the system setting. The choice holds across a reload, the
// system choice follows the browser's colour scheme, and the dark theme keeps AA contrast
// (Q-ACC-1) on the pages a participant and a facilitator use most.
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

async function choose(page: Page, text: Text, option: string): Promise<void> {
  const trigger = page.getByRole("button", { name: new RegExp(`^${text.shell_theme_label}:`) });
  await expectHydrated(trigger);
  await trigger.click();
  await page.getByRole("menuitemradio", { name: option }).click();
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
