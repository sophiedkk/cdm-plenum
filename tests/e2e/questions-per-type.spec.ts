// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The brainstorm questions follow the model type (EL14, SC4): the facilitator sets the type on
// the scope page and the board shows that type's questions as column headings, axe-clean.
import { signInTo } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedProject,
  test,
} from "./fixtures.ts";

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`questions per model type in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("an evaluation project asks the evaluation questions", async ({ page, db }) => {
      const project = await seedProject(db, "discover");
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/scope`,
      );

      // Without a type the board asks the observation questions.
      await page.goto(`/projects/${project.projectId}/brainstorm`);
      await expect(page.getByRole("region", { name: text.board_prompt_recorded })).toBeVisible();

      await page.goto(`/projects/${project.projectId}/scope`);
      const section = page.getByRole("region", { name: text.scope_model_type_heading });
      const evaluation = section.getByRole("radio", { name: text.scope_model_type_evaluation });
      await expectHydrated(evaluation);
      await evaluation.click();
      await section.getByRole("button", { name: text.scope_model_type_save }).click();
      await expect(page.getByText(text.scope_model_type_saved)).toBeVisible();

      await page.goto(`/projects/${project.projectId}/brainstorm`);
      for (const question of [
        text.board_prompt_evaluation_recorded,
        text.board_prompt_evaluation_patient_state,
        text.board_prompt_evaluation_method,
        text.board_prompt_context,
      ]) {
        await expect(page.getByRole("region", { name: question })).toBeVisible();
      }
      await expect(page.getByRole("region", { name: text.board_prompt_recorded })).toHaveCount(0);
      await expectAxeClean(page);
    });
  });
}
