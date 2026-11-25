// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The export page (EX1, EX2, EX3, EX4) in English and Dutch: accessible, keyboard operable, and the
// elements CSV and the decision report download with the server's file name.
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { insertElement } from "../../src/server/test-fixtures.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  requestSignInLink,
  seedProject,
  test,
} from "./fixtures.ts";
import { tabTo } from "./keyboard.ts";

/** Signs in with the e-mail link in `locale` and waits for the projects page. */
async function signInAs(page: Page, email: string, locale: Locale): Promise<void> {
  await page.goto(await requestSignInLink(page, email, locale));
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
}

const HEADER =
  '"name","description","openehr_type","fhir_type","cardinality","sources",' +
  '"ckm_archetype_id","ckm_at_code","ckm_revision","merged_ckm_links","proposed_values",' +
  '"element_code","binding_strength","value_set_url","value_codes","codes_status",' +
  '"refers_to","refers_to_url","group_path","group_cardinality","group_sub_block",' +
  '"registration","units"';

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`export page in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("downloads the elements CSV with the keyboard", async ({ page, db }) => {
      const project = await seedProject(db);
      await insertElement(db, project.projectId, "Systolic pressure");
      await signInAs(page, project.facilitator.email, locale);
      await page.goto(`/projects/${project.projectId}/export`);
      await expect(page.getByRole("heading", { level: 2, name: text.export_title })).toBeVisible();
      // The CSV help is folded under its heading (ADR 0018).
      await expect(page.getByText(text.export_csv_excel)).toBeHidden();
      await page.getByText(text.export_csv_heading).click();
      await expect(page.getByText(text.export_csv_excel)).toBeVisible();
      await expectAxeClean(page);

      const button = page.getByRole("button", {
        name: text.export_download.replace("{name}", text.export_elements_title),
        exact: true,
      });
      await expectHydrated(button);
      await tabTo(page, button, 30);
      const downloading = page.waitForEvent("download");
      await page.keyboard.press("Enter");
      const download = await downloading;
      expect(download.suggestedFilename()).toMatch(/^elements-\d{4}-\d{2}-\d{2}\.csv$/);
      const content = await readFile(await download.path(), "utf8");
      expect(content.charCodeAt(0)).toBe(0xfeff);
      expect(content.slice(1).split("\r\n")[0]).toBe(HEADER);
      await expect(
        page.getByRole("status").filter({ hasText: download.suggestedFilename() }),
      ).toBeVisible();
      await expectAxeClean(page);
    });

    test("downloads the decision report", async ({ page, db }) => {
      const project = await seedProject(db);
      await signInAs(page, project.facilitator.email, locale);
      await page.goto(`/projects/${project.projectId}/export`);
      const button = page.getByRole("button", {
        name: text.export_download.replace("{name}", text.export_decision_report_title),
      });
      await expect(button).toBeVisible();
      await expectAxeClean(page);
      await expectHydrated(button);
      const downloading = page.waitForEvent("download");
      await button.click();
      const download = await downloading;
      expect(download.suggestedFilename()).toMatch(/^decision-report-\d{4}-\d{2}-\d{2}\.md$/);
      const content = await readFile(await download.path(), "utf8");
      expect(content).toMatch(/^# Decision report: /);
      expect(content).toContain("## Aim and scope");
      expect(content).not.toContain(project.facilitator.email);
    });
  });
}
