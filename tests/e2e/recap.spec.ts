// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Phase recaps in English and Dutch (PR13, ADR 0020): in decide a participant opens the recap of
// the scope and of discover from the steps in the header; the current step is no link and a later
// recap's URL leads home. Axe-clean in both themes and at phone width (Q-ACC-1, Q-I18N-1).
import { addElement } from "../../src/server/elements/queries.ts";
import { addElementInput } from "../../src/server/elements/schemas.ts";
import { insertImportedElement } from "../../src/server/test-fixtures.ts";
import { seedScope, signInTo, userIdOf } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeCleanInBothThemes,
  type Locale,
  MESSAGES,
  seedParticipant,
  seedProject,
  test,
} from "./fixtures.ts";

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`phase recaps in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("a participant opens the recaps of the done phases from the steps", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      await seedScope(db, project.facilitator.userId, project.projectId, {
        concept: "The blood pressure of an adult at the outpatient clinic.",
        useCases: "Outpatient visit.",
        outOfScope: "Invasive pressure.",
      });
      const participant = await seedParticipant(db, project);
      await insertImportedElement(db, project.projectId, "Systolic");
      const added = await addElement(
        db,
        await userIdOf(db, participant),
        addElementInput.parse({
          projectId: project.projectId,
          name: "Cuff size",
          prompt: "method",
        }),
      );
      if (!added.ok) throw new Error(added.error);
      await db
        .updateTable("project")
        .set({ phase: "decide" })
        .where("id", "=", project.projectId)
        .execute();

      await signInTo(page, participant, locale, `/projects/${project.projectId}`);
      const steps = page.getByRole("list", { name: text.projects_steps_label });
      await expect(steps.locator('[aria-current="step"]').getByRole("link")).toHaveCount(0);
      await steps.getByRole("link", { name: new RegExp(text.projects_phase_scope) }).click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/recap/scope"));
      await expect(
        page.getByRole("heading", { level: 2, name: text.projects_recap_scope_title }),
      ).toBeVisible();
      await expect(page.getByText("Invasive pressure.")).toBeVisible();
      await expect(
        steps.getByRole("link", { name: new RegExp(text.projects_phase_scope) }),
      ).toHaveAttribute("aria-current", "page");
      await expectAxeCleanInBothThemes(page);

      await steps.getByRole("link", { name: new RegExp(text.projects_phase_discover) }).click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/recap/discover"));
      await expect(
        page.getByRole("heading", { level: 2, name: text.projects_recap_discover_title }),
      ).toBeVisible();
      await expect(page.getByText(text.projects_recap_into_round)).toBeVisible();
      await expect(
        page.getByText(fill(text.projects_recap_from_models, { models: 1 })),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: new RegExp(text.board_group_method) }),
      ).toBeVisible();
      await expectAxeCleanInBothThemes(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await expectAxeCleanInBothThemes(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);

      // The current phase has no recap: its URL leads to the project's first page.
      await page.goto(`/projects/${project.projectId}/recap/decide`);
      await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}`);
    });

    test("a recap page marks the phase step, not a tab, as current for the facilitator", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "decide");
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/recap/scope`,
      );
      const tabs = page.getByRole("navigation", { name: text.projects_tabs_label });
      await expect(tabs).toBeVisible();
      await expect(tabs.locator('[aria-current="page"]')).toHaveCount(0);
      await expect(
        page
          .getByRole("list", { name: text.projects_steps_label })
          .locator('[aria-current="page"]'),
      ).toHaveCount(1);
      await expectAxeCleanInBothThemes(page);
    });
  });
}
