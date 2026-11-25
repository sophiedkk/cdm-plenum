// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The hand-off page (PR4, #64) in English and Dutch: every member reads the agreed model, only
// the facilitator sees the downloads, and the elements CSV comes with commas and with
// semicolons (EX1, #68). Axe-clean on every page.
import { readFile } from "node:fs/promises";
import { closedRoundWithOutcomes, insertElement } from "../../src/server/test-fixtures.ts";
import { signInTo } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedParticipant,
  seedProject,
  test,
} from "./fixtures.ts";

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`hand-off page in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("the facilitator reads the model and downloads both CSV files", async ({ page, db }) => {
      const project = await seedProject(db, "handoff");
      const systolic = await insertElement(db, project.projectId, "Systolic pressure");
      await closedRoundWithOutcomes(db, project.projectId, [[systolic, "included"]]);

      // The Overview leads here with its one main button; the old export URL follows it.
      await signInTo(page, project.facilitator.email, locale, `/projects/${project.projectId}`);
      await page.getByRole("link", { name: text.projects_overview_export_action }).click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/handoff"));
      await page.goto(`/projects/${project.projectId}/export`);
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/handoff"));

      await expect(
        page.getByRole("heading", { level: 2, name: text.projects_phase_handoff }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { level: 3, name: "Systolic pressure" }),
      ).toBeVisible();
      await expect(page.getByTestId("task-bar")).toHaveCount(0);
      await expectAxeClean(page);

      const comma = page.getByRole("button", {
        name: text.export_download.replace("{name}", text.export_elements_title),
        exact: true,
      });
      await expectHydrated(comma);
      let downloading = page.waitForEvent("download");
      await comma.click();
      let download = await downloading;
      expect(download.suggestedFilename()).toMatch(/^elements-\d{4}-\d{2}-\d{2}\.csv$/);
      let content = await readFile(await download.path(), "utf8");
      expect(content.slice(1).split("\r\n")[0]).toMatch(/^"name","description","openehr_type",/);

      downloading = page.waitForEvent("download");
      await page
        .getByRole("button", {
          name: text.export_download.replace("{name}", text.export_elements_semicolon_title),
        })
        .click();
      download = await downloading;
      expect(download.suggestedFilename()).toMatch(/^elements-semicolon-\d{4}-\d{2}-\d{2}\.csv$/);
      content = await readFile(await download.path(), "utf8");
      expect(content.charCodeAt(0)).toBe(0xfeff);
      expect(content.slice(1).split("\r\n")[0]).toMatch(/^"name";"description";"openehr_type";/);
      await expect(
        page.getByRole("status").filter({ hasText: download.suggestedFilename() }),
      ).toBeVisible();
      await expectAxeClean(page);
    });

    test("a participant reads the model and has no download", async ({ page, db }) => {
      const project = await seedProject(db, "handoff");
      const systolic = await insertElement(db, project.projectId, "Systolic pressure");
      await closedRoundWithOutcomes(db, project.projectId, [[systolic, "included"]]);
      const participant = await seedParticipant(db, project);

      await signInTo(page, participant, locale, `/projects/${project.projectId}`);
      await expectAxeClean(page);
      await page.getByRole("link", { name: text.projects_task_handoff_action }).click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/handoff"));
      await expect(
        page.getByRole("heading", { level: 3, name: "Systolic pressure" }),
      ).toBeVisible();
      // The task bar says the model is agreed and leads back to the home (P1).
      const bar = page.getByTestId("task-bar");
      await expect(
        bar.getByRole("heading", { name: text.projects_bar_handoff_title }),
      ).toBeVisible();
      await expect(bar.getByText(text.projects_bar_handoff_done)).toBeVisible();
      await expect(bar.getByRole("link", { name: text.projects_back_task })).toHaveAttribute(
        "href",
        `/projects/${project.projectId}`,
      );
      await expect(
        page.getByRole("button", { name: new RegExp(text.export_download.replace("{name}", "")) }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("heading", { name: text.projects_handoff_downloads }),
      ).toHaveCount(0);
      await expectAxeClean(page);

      // The export URL is the facilitator's: a participant lands on the project home.
      await page.goto(`/projects/${project.projectId}/export`);
      await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}`);
    });

    test("the hand-off page of an earlier phase leads back to the project home", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "detail");
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/handoff`,
      );
      await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}`);
    });
  });
}
