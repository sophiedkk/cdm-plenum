// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The element board (EL1 to EL7, EL21): in discover a participant reads the board without the
// data type column or an Add button and never sees an author (EL2, Q-ANON-1); the facilitator adds
// an element with the keyboard, asked only for a name and a description (EL1), merges
// duplicates, imports a CSV file and uses CKM
// through the stub (tests/e2e/ckm-stub.ts); every page and dialog is axe-clean in English and
// Dutch (Q-ACC-1, Q-I18N-1); 10 elements fit on the first screen at 1280 by 800 (Q-USE-1).
import type { Page } from "@playwright/test";
import { seedElement, seedReveal, signInTo, userIdOf } from "./board-seed.ts";
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

type Text = (typeof MESSAGES)[Locale];

/** Opens the details of the element `name` on the board, unless open, and returns them. */
async function openDetails(page: Page, text: Text, name: string) {
  const toggle = page.getByRole("button", { name, exact: true });
  await expectHydrated(toggle);
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  return page.getByRole("region", { name: fill(text.board_details_label, { name }) });
}

/** The name cells of the board, one per element. */
function boardRows(page: Page, text: Text) {
  return page.getByRole("table", { name: text.board_list_label }).getByRole("rowheader");
}

/** Chooses `item` in the facilitator's "More actions" menu. */
async function chooseMoreAction(page: Page, text: Text, item: string): Promise<void> {
  const more = page.getByRole("button", { name: text.board_more_actions });
  await expectHydrated(more);
  await more.click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** Links the element `name` to the first blood pressure element called `ckmName`, via the stub. */
async function linkToCkm(page: Page, text: Text, name: string, ckmName: string): Promise<void> {
  await openDetails(page, text, name);
  const link = page.getByRole("button", {
    name: new RegExp(`${escapeRegExp(text.board_link_ckm)}.*${escapeRegExp(name)}`),
  });
  await expectHydrated(link);
  await link.click();
  const dialog = page.getByRole("dialog", { name: fill(text.board_ckm_link_title, { name }) });
  await dialog.getByLabel(text.board_ckm_search_label).fill("blood pressure");
  await dialog.getByRole("button", { name: text.board_ckm_search_submit }).click();
  await dialog
    .getByRole("button", { name: fill(text.board_ckm_open, { name: "Blood pressure" }) })
    .click();
  // Blood pressure has these elements in more than one event; the first is the any-event one.
  await dialog
    .getByRole("button", { name: fill(text.board_ckm_link_to, { name: ckmName }) })
    .first()
    .click();
  await expect(dialog).toHaveCount(0);
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`element board in ${locale}`, () => {
    // Sonner fades toasts in; axe would measure the contrast of a half-faded toast.
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce" });
    const text = MESSAGES[locale];

    test("a participant in discover reads the board without data type or Add, and sees no author", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      const participant = await seedParticipant(db, project);
      await seedElement(db, project.facilitator.userId, project.projectId, {
        name: "Diastolic",
        description: "Lowest pressure in the cycle.",
      });
      // The shared board after the brainstorm; brainstorm.spec.ts covers the private step.
      await seedReveal(db, project.facilitator.userId, project.projectId);
      const bodies: string[] = [];
      page.on("response", async (response) => {
        if (response.url().includes("_serverFn"))
          bodies.push(await response.text().catch(() => ""));
      });
      await signInTo(page, participant, locale, `/projects/${project.projectId}/board`);
      await expect(page.getByRole("rowheader", { name: "Diastolic" })).toBeVisible();
      await expect(page.getByRole("button", { name: text.board_more_actions })).toHaveCount(0);
      await expect(page.getByRole("link", { name: text.board_models_title })).toHaveCount(0);
      // Participants add on the brainstorm only (ADR 0018).
      await expect(page.getByRole("button", { name: text.board_add })).toHaveCount(0);
      // Data type and cardinality wait for their phase (EL21).
      const table = page.getByRole("table", { name: text.board_list_label });
      await expect(
        table.getByRole("columnheader", { name: text.board_field_data_type }),
      ).toHaveCount(0);
      await expect(
        table.getByRole("columnheader", { name: text.board_field_cardinality }),
      ).toHaveCount(0);
      await expect(
        table.getByRole("columnheader", { name: text.board_column_question }),
      ).toBeVisible();
      await expectAxeClean(page);

      const details = await openDetails(page, text, "Diastolic");
      await expect(details).toContainText("Lowest pressure in the cycle.");
      await expect(details).not.toContainText(text.board_field_data_type);
      await expect(page.getByText(text.board_field_author)).toHaveCount(0);
      await expectAxeClean(page);
      for (const body of [...bodies, await page.content()]) {
        expect(body).not.toContain(project.facilitator.email);
      }
    });

    test("the facilitator adds an element with the keyboard, asked only for a name and a description", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/board`,
      );
      const add = page.getByRole("button", { name: text.board_add });
      await expectHydrated(add);
      await tabTo(page, add, 40);
      await page.keyboard.press("Enter");
      const dialog = page.getByRole("dialog", { name: text.board_add_title });
      await expect(dialog.getByLabel(text.board_name_label, { exact: true })).toBeFocused();
      // EL1: a name and a description, and nothing else.
      await expect(dialog.getByRole("textbox")).toHaveCount(2);
      await expect(dialog.getByRole("radio")).toHaveCount(0);
      await expect(dialog.getByText(text.board_cardinality_legend, { exact: true })).toHaveCount(0);
      await expectAxeClean(page);
      await page.keyboard.type("Systolic");
      await page.keyboard.press("Tab");
      await page.keyboard.type("Highest pressure in the cycle.");
      await tabTo(page, dialog.getByRole("button", { name: text.board_add }), 5);
      await page.keyboard.press("Enter");
      await expect(dialog).toHaveCount(0);

      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader", { name: "Systolic" }) });
      await expect(row).toContainText(text.board_prompt_short_none);
      // The disclosure opens with the keyboard as well.
      const toggle = page.getByRole("button", { name: "Systolic", exact: true });
      await toggle.focus();
      await page.keyboard.press("Enter");
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      const details = page.getByRole("region", {
        name: fill(text.board_details_label, { name: "Systolic" }),
      });
      await expect(details).toContainText("Highest pressure in the cycle.");
      // The facilitator keeps the edit action for the later fields in every phase (EL21).
      await expect(
        details.getByRole("button", { name: new RegExp(`^${escapeRegExp(text.board_edit)}`) }),
      ).toBeVisible();
      await expectAxeClean(page);
    });

    test("the facilitator sees authors and merges two elements", async ({ page, db }) => {
      const project = await seedProject(db, "discover");
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
      await expect(await openDetails(page, text, "Systolic pressure")).toContainText(participant);
      await expectAxeClean(page);

      await chooseMoreAction(page, text, text.board_merge);
      const dialog = page.getByRole("dialog", { name: text.board_merge_title });
      await dialog.getByLabel(text.board_merge_into_label).selectOption({ label: "1. Systolic" });
      await dialog.getByRole("checkbox", { name: "2. Systolic pressure" }).check();
      await expectAxeClean(page);
      await dialog.getByRole("button", { name: text.board_merge_submit }).click();
      await expect(dialog).toHaveCount(0);
      await expect(boardRows(page, text)).toHaveCount(1);
      const kept = await openDetails(page, text, "Systolic");
      await expect(kept).toContainText("Peak");
      await expect(kept).toContainText("Highest");
    });

    test("a merged duplicate's CKM link shows as provenance on the kept element", async ({
      page,
      db,
    }) => {
      // The CKM column of the board shows from the decide phase on (EL21).
      const project = await seedProject(db, "decide");
      const author = project.facilitator.userId;
      await seedElement(db, author, project.projectId, { name: "Top pressure" });
      await seedElement(db, author, project.projectId, { name: "Bottom pressure" });
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/board`,
      );
      await linkToCkm(page, text, "Top pressure", "Systolic");
      await linkToCkm(page, text, "Bottom pressure", "Diastolic");

      await chooseMoreAction(page, text, text.board_merge);
      const dialog = page.getByRole("dialog", { name: text.board_merge_title });
      await dialog
        .getByLabel(text.board_merge_into_label)
        .selectOption({ label: "1. Top pressure" });
      await dialog.getByRole("checkbox", { name: "2. Bottom pressure" }).check();
      await dialog.getByRole("button", { name: text.board_merge_submit }).click();
      await expect(dialog).toHaveCount(0);
      await expect(boardRows(page, text)).toHaveCount(1);
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader", { name: "Top pressure" }) });
      await expect(row).toContainText(text.board_ckm_status_linked);

      const kept = await openDetails(page, text, "Top pressure");
      await expect(kept).toContainText(text.board_ckm_linked_badge);
      await expect(kept).toContainText(new RegExp(`${escapeRegExp(BP_ID)}.*at0004`));
      const provenance = kept.getByRole("list", { name: text.board_ckm_merged_badge });
      await expect(provenance.getByRole("listitem")).toHaveText([
        new RegExp(`^${escapeRegExp(BP_ID)}.*2\\.0\\.17.*at0005 \\(Diastolic\\)$`),
      ]);
      await expectAxeClean(page);
    });

    test("the CSV preview shows a refused row and the import adds the others", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
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
      await expect(boardRows(page, text)).toHaveCount(2);
      await expect(await openDetails(page, text, "Rhythm")).toContainText("CSV: elements.csv");
    });

    test("the facilitator imports a CKM archetype through Existing models, and a CKM failure leaves the page usable", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/board`,
      );
      // NOTE: ADR 0020. The board imports no models; its button leads to Existing models.
      const open = page.getByRole("link", { name: text.board_models_title });
      await expectHydrated(open);
      await tabTo(page, open, 40);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/models"));
      const add = page.getByRole("button", { name: text.board_models_add_title });
      await expectHydrated(add);
      await add.click();
      const dialog = page.getByRole("dialog", { name: text.board_models_add_title });
      const search = dialog.getByLabel(text.board_models_search_ckm);
      await search.fill("unavailable");
      await page.keyboard.press("Enter");
      await expect(dialog.getByRole("alert")).toContainText(text.common_refusal_ckm_refused);
      await expectAxeClean(page);

      // The FHIR tab offers the packages EL10 names; opening one needs the live registry.
      await dialog.getByRole("tab", { name: text.board_models_kind_fhir }).click();
      await expect(
        dialog.getByRole("heading", { name: text.board_models_fhir_quick }),
      ).toBeVisible();
      await expect(dialog.getByRole("button", { name: "hl7.fhir.r4.core" })).toBeVisible();
      await expect(dialog.getByRole("button", { name: "nictiz.fhir.nl.r4.nl-core" })).toBeVisible();
      await expectAxeClean(page);
      await dialog.getByRole("tab", { name: text.board_models_kind_ckm }).click();

      await search.fill("blood pressure");
      await page.keyboard.press("Enter");
      await expect(dialog.getByText(BP_ID)).toBeVisible();
      await dialog
        .getByRole("button", {
          name: fill(text.board_models_add_named, { name: "Blood pressure" }),
        })
        .click();
      await expect(dialog).toHaveCount(0);
      await page.getByRole("button", { name: text.board_models_put_on_list }).click();
      await expect(page.getByText(text.board_models_all_listed)).toBeVisible();
      await page
        .getByRole("navigation", { name: text.projects_tabs_label })
        .getByRole("link", { name: text.projects_tab_elements })
        .click();
      const systolic = await openDetails(page, text, "Systolic");
      await expect(systolic).toContainText(text.board_ckm_linked_badge);
      await expect(systolic).toContainText(`${BP_ID}`);
      await expectAxeClean(page);
    });
  });

  test.describe(`compact board in ${locale}`, () => {
    test.use({
      locale: BROWSER_LOCALE[locale],
      reducedMotion: "reduce",
      viewport: { width: 1280, height: 800 },
    });
    const text = MESSAGES[locale];

    test("shows 10 elements on the first screen at 1280 by 800 (Q-USE-1)", async ({ page, db }) => {
      const project = await seedProject(db, "discover");
      for (let index = 1; index <= 10; index++) {
        await seedElement(db, project.facilitator.userId, project.projectId, {
          name: `Element ${index}`,
          description: `What element ${index} records, written as a description long enough to be cut off in its column.`,
        });
      }
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/board`,
      );
      const tenth = page.getByRole("rowheader", { name: "Element 10" });
      await expect(tenth).toBeVisible();
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const box = await page.getByRole("row").filter({ has: tenth }).boundingBox();
      expect(box).not.toBeNull();
      expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(800);
      await expectAxeClean(page);

      await openDetails(page, text, "Element 10");
      await expectAxeClean(page);
      await page.getByRole("button", { name: text.board_more_actions }).click();
      await expect(page.getByRole("menuitem", { name: text.board_merge })).toBeVisible();
      await expectAxeClean(page);
    });
  });
}

test("the facilitator links an element to a CKM archetype element", async ({ page, db }) => {
  const text = MESSAGES.en;
  // The data type the link carries stays hidden until the detail phase (EL21).
  const project = await seedProject(db, "decide");
  await seedElement(db, project.facilitator.userId, project.projectId, { name: "Top pressure" });
  await signInTo(page, project.facilitator.email, "en", `/projects/${project.projectId}/board`);
  const card = await openDetails(page, text, "Top pressure");
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
  await expect(card).toContainText(
    new RegExp(`${escapeRegExp(BP_ID)}, revision 2\\.0\\.17, element at0004`),
  );
  await expect(card).not.toContainText(text.board_field_data_type);
  await expect(card).not.toContainText("DV_QUANTITY");
  const stored = await db
    .selectFrom("element_ckm_link")
    .innerJoin("element", "element.id", "element_ckm_link.element_id")
    .select("element_ckm_link.rm_type")
    .where("element.project_id", "=", project.projectId)
    .executeTakeFirstOrThrow();
  expect(stored.rm_type).toBe("DV_QUANTITY");
});
