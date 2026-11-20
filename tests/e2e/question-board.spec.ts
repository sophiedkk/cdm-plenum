// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The brainstorm board with existing models in English and Dutch (EL12, EL23, ADR 0020): before
// the reveal a participant sees the elements from existing models in their column, and suggests
// a model for the facilitator to review. Axe-clean in both themes and at phone width (Q-ACC-1).
import { insertImportedElement } from "../../src/server/test-fixtures.ts";
import { signInTo } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeCleanAfterToasts,
  expectAxeCleanInBothThemes,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedParticipant,
  seedProject,
  test,
} from "./fixtures.ts";

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`question board in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("a participant sees the existing models' elements and suggests a model", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      const participant = await seedParticipant(db, project);
      const position = await insertImportedElement(db, project.projectId, "Position");
      await db
        .updateTable("element")
        .set({ prompt: "patient_state" })
        .where("id", "=", position)
        .execute();

      await signInTo(page, participant, locale, `/projects/${project.projectId}/brainstorm`);
      const column = page.getByRole("region", { name: text.board_prompt_patient_state });
      await expect(
        column.getByRole("list", { name: text.board_column_from_models }).getByText("Position"),
      ).toBeVisible();
      await expectAxeCleanInBothThemes(page);
      await page.setViewportSize({ width: 390, height: 844 });
      await expectAxeCleanInBothThemes(page);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      ).toBe(true);

      const suggest = page.getByRole("button", { name: text.board_suggest_title });
      await expectHydrated(suggest);
      await suggest.click();
      const dialog = page.getByRole("dialog", { name: text.board_suggest_title });
      await dialog.getByLabel(text.board_models_title_label).fill("Ward pulse chart");
      await dialog.getByRole("button", { name: text.board_suggest_submit }).click();
      await expect(page.getByText(text.board_suggest_sent)).toBeVisible();
      await expectAxeCleanAfterToasts(page);
      const rows = await db
        .selectFrom("source_model")
        .select(["title", "status"])
        .where("project_id", "=", project.projectId)
        .where("status", "=", "suggested")
        .execute();
      expect(rows).toEqual([{ title: "Ward pulse chart", status: "suggested" }]);
    });
  });
}
