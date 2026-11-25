// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's Settings page in English and Dutch (PR12, ADR 0018, Q-ACC-1, Q-I18N-1): the
// change class and the private brainstorm save from one page that a participant never reaches,
// and the page is axe-clean in the light and the dark theme.
import type { Page } from "@playwright/test";
import { signInTo } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeCleanInBothThemes,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedParticipant,
  seedProject,
  test,
} from "./fixtures.ts";

/** Waits until every toast has finished its entry animation, so axe measures it as it is read. */
async function toastsSettled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator("[data-sonner-toast]")
        .evaluateAll((toasts) => toasts.every((toast) => getComputedStyle(toast).opacity === "1")),
    )
    .toBe(true);
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`settings in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("the facilitator saves the change class and the private brainstorm setting", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      // A panel of nobody meets a minimum of nothing, so the page shows its one line.
      await db
        .insertInto("project_panel_minimum")
        .values(
          (["clinical", "terminology", "architecture"] as const).map((expert_type) => ({
            project_id: project.projectId,
            expert_type,
            minimum: 0,
          })),
        )
        .execute();
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/members`,
      );
      const menu = page
        .getByRole("navigation", { name: text.projects_tabs_label })
        .getByRole("button", { name: text.projects_tab_project });
      await expectHydrated(menu);
      await menu.click();
      await page.getByRole("menuitem", { name: text.projects_tab_settings, exact: true }).click();
      await expect(page).toHaveURL(
        (url) => url.pathname === `/projects/${project.projectId}/settings`,
      );
      await expect(
        page.getByRole("heading", { level: 2, name: text.projects_settings_title }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: text.rounds_panel_heading })).toBeVisible();
      // Every setting applies when changed: no save buttons, and the panel is one line.
      await expect(page.getByText(text.rounds_panel_meets_minimum)).toBeVisible();
      await expect(page.getByRole("table")).toHaveCount(0);
      // Only the minimum, whose counts and reason belong together, keeps a save button.
      await expect(page.getByRole("button", { name: /save|opslaan/i })).toHaveCount(1);
      await expect(page.getByRole("button", { name: text.rounds_minimum_save })).toBeVisible();
      await expectAxeCleanInBothThemes(page);
      const show = page.getByRole("button", { name: text.rounds_panel_show_table });
      await expectHydrated(show);
      await show.click();
      await expect(page.getByRole("table", { name: text.rounds_panel_caption })).toBeVisible();
      await expectAxeCleanInBothThemes(page);

      // The change class (DE11).
      const classB = page.getByRole("radio", { name: text.rounds_change_class_b });
      await expectHydrated(classB);
      await classB.click();
      await expect(page.getByRole("status").filter({ hasText: text.common_saved })).toBeVisible();
      await expect
        .poll(async () => {
          const row = await db
            .selectFrom("project")
            .select("change_class")
            .where("id", "=", project.projectId)
            .executeTakeFirstOrThrow();
          return row.change_class;
        })
        .toBe("B");

      // The private brainstorm (EL13), on by default.
      const privately = page.getByRole("switch", { name: text.members_private_label });
      await expect(privately).toBeChecked();
      await privately.click();
      await expect(privately).not.toBeChecked();
      await expect(page.getByRole("status").filter({ hasText: text.common_saved })).toHaveCount(2);
      const row = await db
        .selectFrom("project")
        .select("private_brainstorm")
        .where("id", "=", project.projectId)
        .executeTakeFirstOrThrow();
      expect(row.private_brainstorm).toBe(false);
      await toastsSettled(page);
      await expectAxeCleanInBothThemes(page);
    });
  });
}

test("a participant has no Settings tab and the URL sends them to the project home", async ({
  page,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db, "scope");
  const participant = await seedParticipant(db, project);
  await signInTo(page, participant, "en", `/projects/${project.projectId}/settings`);
  await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}`);
  await expect(page.getByRole("link", { name: text.projects_tab_settings })).toHaveCount(0);
});
