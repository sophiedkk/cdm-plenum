// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The element board (EL1 to EL7): a participant adds an element with the keyboard and never sees
// an author (EL2, Q-ANON-1); the facilitator merges duplicates, imports a CSV file and uses CKM
// through the stub (tests/e2e/ckm-stub.ts); every page and dialog is axe-clean in English and
// Dutch (Q-ACC-1, Q-I18N-1).
import { seedElement, signInTo, userIdOf } from "./board-seed.ts";
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
import { tabTo } from "./keyboard.ts";

const BP_ID = "openEHR-EHR-OBSERVATION.blood_pressure.v2";

/** Fills the `{name}` placeholders of a catalogue text. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`element board in ${locale}`, () => {
    // Sonner fades toasts in; axe would measure the contrast of a half-faded toast.
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce" });
    const text = MESSAGES[locale];

    test("a participant adds an element with the keyboard and sees no author", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      const participant = await seedParticipant(db, project);
      await seedElement(db, project.facilitator.userId, project.projectId, {
        name: "Diastolic",
      });
      const bodies: string[] = [];
      page.on("response", async (response) => {
        if (response.url().includes("_serverFn"))
          bodies.push(await response.text().catch(() => ""));
      });
      await signInTo(page, participant, locale, `/projects/${project.projectId}/board`);
      await expect(page.getByRole("heading", { level: 3, name: /Diastolic/ })).toBeVisible();
      await expect(page.getByRole("button", { name: text.board_merge })).toHaveCount(0);
      await expectAxeClean(page);

      const add = page.getByRole("button", { name: text.board_add });
      await expectHydrated(add);
      await tabTo(page, add, 40);
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: text.board_add_title });
      await expect(dialog.getByLabel(text.board_name_label, { exact: true })).toBeFocused();
      await expectAxeClean(page);
      await page.keyboard.type("Systolic");
      await page.keyboard.press("Tab");
      await page.keyboard.type("Highest pressure in the cycle.");
      await page.keyboard.press("Tab");
      // The radio group starts on "not decided"; the arrows move through the types.
      await expect(dialog.getByRole("radio", { checked: true })).toBeFocused();
      for (const _ of [1, 2, 3]) await page.keyboard.press("ArrowDown");
      await expect(
        dialog.getByRole("radio", { name: new RegExp(`^${text.board_type_quantity_name}`) }),
      ).toBeChecked();
      await tabTo(page, dialog.getByRole("button", { name: text.board_add }), 10);
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);

      const card = page.getByRole("article", { name: /Systolic/ });
      await expect(card).toContainText("DV_QUANTITY / Quantity");
      await expect(page.getByText(text.board_field_author)).toHaveCount(0);
      await expectAxeClean(page);
      for (const body of [...bodies, await page.content()]) {
        expect(body).not.toContain(project.facilitator.email);
      }
    });

    test("the facilitator sees authors and merges two elements", async ({ page, db }) => {
      const project = await seedProject(db);
      const participant = await seedParticipant(db, project);
      const author = await userIdOf(db, participant);
      await seedElement(db, author, project.projectId, { name: "Systolic", description: "Peak" });
      await seedElement(db, author, project.projectId, {
        name: "Systolic pressure",
        description: "Highest",
      });
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/board`,
      );
      await expect(page.getByRole("article", { name: /Systolic pressure/ })).toContainText(
        participant,
      );
      await expectAxeClean(page);

      const merge = page.getByRole("button", { name: text.board_merge });
      await expectHydrated(merge);
      await merge.click();
      const dialog = page.getByRole("dialog", { name: text.board_merge_title });
      await dialog.getByLabel(text.board_merge_into_label).selectOption({ label: "1. Systolic" });
      await dialog.getByRole("checkbox", { name: "2. Systolic pressure" }).check();
      await expectAxeClean(page);
      await dialog.getByRole("button", { name: text.board_merge_submit }).click();
      await expect(dialog).toHaveCount(0);
      await expect(page.getByRole("article")).toHaveCount(1);
      const kept = page.getByRole("article", { name: /Systolic/ });
      await expect(kept).toContainText("Peak");
      await expect(kept).toContainText("Highest");
    });

    test("the CSV preview shows a refused row and the import adds the others", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/board/import`,
      );
      await expect(
        page.getByRole("heading", { level: 2, name: text.board_import_title }),
      ).toBeVisible();
      await expectAxeClean(page);

      const file = page.getByLabel(text.board_import_file_label);
      await expectHydrated(file);
      await file.setInputFiles({
        name: "elements.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "name,description,data_type\nPulse rate,Beats per minute,count\n,No name,\nRhythm,Regular or not,coded_text\n",
        ),
      });
      await file.focus();
      await tabTo(page, page.getByRole("button", { name: text.board_import_preview }), 5);
      await page.keyboard.press("Enter");
      const refused = page.getByRole("table", { name: text.board_import_refused_heading });
      await expect(refused.getByRole("row").nth(1)).toContainText("3");
      await expect(refused).toContainText(text.board_csv_row_name_missing);
      await expect(
        page.getByRole("table", { name: text.board_import_accepted_heading }),
      ).toContainText("Pulse rate");
      await expectAxeClean(page);

      const submit = page.getByRole("button", {
        name: fill(text.board_import_submit, { count: 2 }),
      });
      await tabTo(page, submit, 10);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/board"));
      await expect(page.getByRole("article")).toHaveCount(2);
      await expect(page.getByRole("article", { name: /Rhythm/ })).toContainText(
        "CSV: elements.csv",
      );
    });

    test("the facilitator imports a CKM archetype, and a CKM failure leaves the board usable", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/board`,
      );
      const open = page.getByRole("button", { name: text.board_ckm_search });
      await expectHydrated(open);
      await tabTo(page, open, 40);
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: text.board_ckm_title });
      const search = dialog.getByLabel(text.board_ckm_search_label);
      await tabTo(page, search, 5);
      await page.keyboard.type("unavailable");
      await page.keyboard.press("Enter");
      await expect(dialog.getByRole("alert")).toContainText(text.common_refusal_ckm_refused);
      await expectAxeClean(page);

      await search.fill("blood pressure");
      await page.keyboard.press("Enter");
      await expect(dialog.getByRole("table")).toContainText(BP_ID);
      await expectAxeClean(page);
      await dialog
        .getByRole("button", { name: fill(text.board_ckm_open, { name: "Blood pressure" }) })
        .click();
      await expect(dialog.getByRole("table")).toContainText("at0004");
      await expectAxeClean(page);
      await dialog.getByRole("button", { name: text.board_ckm_import }).click();
      await expect(dialog).toHaveCount(0);
      const systolic = page.getByRole("article", { name: /^\d+\. ?Systolic$/ });
      await expect(systolic).toContainText(text.board_ckm_linked_badge);
      await expect(systolic).toContainText(`${BP_ID}`);
      await expectAxeClean(page);
    });
  });
}

test("the facilitator links an element to a CKM archetype element", async ({ page, db }) => {
  const text = MESSAGES.en;
  const project = await seedProject(db);
  await seedElement(db, project.facilitator.userId, project.projectId, { name: "Top pressure" });
  await signInTo(page, project.facilitator.email, "en", `/projects/${project.projectId}/board`);
  const link = page.getByRole("button", {
    name: new RegExp(`${text.board_link_ckm}.*Top pressure`),
  });
  await expectHydrated(link);
  await link.click();
  const dialog = page.getByRole("dialog", {
    name: fill(text.board_ckm_link_title, { name: "Top pressure" }),
  });
  await dialog.getByLabel(text.board_ckm_search_label).fill("blood pressure");
  await dialog.getByRole("button", { name: text.board_ckm_search_submit }).click();
  await dialog
    .getByRole("button", { name: fill(text.board_ckm_open, { name: "Blood pressure" }) })
    .click();
  // Blood pressure has a Systolic element in more than one event; the first is the any-event one.
  await dialog
    .getByRole("button", { name: fill(text.board_ckm_link_to, { name: "Systolic" }) })
    .first()
    .click();
  await expect(dialog).toHaveCount(0);
  const card = page.getByRole("article", { name: /Top pressure/ });
  await expect(card).toContainText(
    new RegExp(`${escapeRegExp(BP_ID)}, revision 2\\.0\\.17, element at0004`),
  );
  await expect(card).toContainText("Quantity (DV_QUANTITY / Quantity)");
});
