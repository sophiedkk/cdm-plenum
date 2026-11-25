// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The reference element in English and Dutch (EL26, ADR 0021, Q-ACC-1): a participant adds an
// element that refers to another model on the brainstorm board, the board names the model once
// under the element, and the rating card names it too, under the same question as any element.
// The facilitator adds one from the board's own form, whose title and link open below the choice.
import type { Locator, Page } from "@playwright/test";
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { setPhase } from "../../src/server/test-fixtures.ts";
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

const TITLE = "Zib Bloeddruk";
const URL = "https://models.example.test/zib/bloeddruk";

/** Fills the `{name}` placeholders of a catalogue text. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** The top of an element in the document, so a scroll that follows the focus does not count. */
function pageY(element: Locator): Promise<number> {
  return element.evaluate((node) => node.getBoundingClientRect().top + window.scrollY);
}

/** The top of an element once its dialog has finished animating into place. */
async function settledY(element: Locator): Promise<number> {
  await element.evaluate((node) =>
    Promise.all(
      (node.closest("[role=dialog]")?.getAnimations() ?? []).map((animation) => animation.finished),
    ),
  );
  return pageY(element);
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`reference element in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce" });
    const text = MESSAGES[locale];
    const modelLink = (scope: Locator | Page) =>
      scope.getByRole("link", { name: new RegExp(`^${TITLE}`) });

    test("a participant adds a reference on the brainstorm, then sees it on the board and the rating card", async ({
      page,
      db,
    }) => {
      test.setTimeout(120_000);
      const project = await seedProject(db, "discover");
      const { projectId } = project;
      const participant = await seedParticipant(db, project);
      await signInTo(page, participant, locale, `/projects/${projectId}/brainstorm`);

      const question = text.board_prompt_recorded;
      const form = page.getByRole("form", {
        name: fill(text.board_column_add_label, { question }),
      });
      const name = form.getByRole("textbox").first();
      await expectHydrated(name);
      await name.fill("Blood pressure");
      const choice = form.getByRole("checkbox", { name: text.board_reference_choice });
      const nameBefore = await pageY(name);
      const choiceBefore = await pageY(choice);
      await choice.click();
      // The title and link open below the choice, so the name field and the choice stay put.
      await expect(form.getByLabel(text.board_reference_title_label)).toBeVisible();
      expect(await pageY(name)).toBe(nameBefore);
      expect(await pageY(choice)).toBe(choiceBefore);
      await form.getByLabel(text.board_reference_title_label).fill(TITLE);
      await form.getByLabel(text.board_reference_url_label).fill(URL);
      await expectAxeClean(page);
      await form.getByRole("button", { name: text.board_add }).click();
      const yours = page
        .getByRole("region", { name: question })
        .getByRole("list", { name: text.board_column_yours });
      await expect(yours.getByRole("listitem")).toContainText("Blood pressure");
      await expect(modelLink(yours)).toHaveAttribute("href", URL);
      await expectAxeClean(page);

      // The board names the model once, under the element's name.
      await page.goto(`/projects/${projectId}/board`);
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("button", { name: "Blood pressure", exact: true }) });
      await expect(row).toContainText(text.board_reference_refers_to);
      await expect(modelLink(row)).toHaveAttribute("href", URL);
      await expect(page.getByText(TITLE)).toHaveCount(1);
      await expectAxeClean(page);

      // In a round the card asks the same question as for any element and names the model.
      await setPhase(db, projectId, "decide");
      const roundId = await openedRound(
        db,
        project.facilitator.userId,
        projectId,
        {},
        "An invented test panel",
      );
      await page.goto(`/projects/${projectId}/rounds/${roundId}/rate`);
      const card = page.getByRole("region", { name: "Blood pressure" });
      await expect(card.getByText(text.rounds_rate_question)).toBeVisible();
      await expect(card).toContainText(text.board_reference_refers_to);
      await expect(modelLink(card)).toHaveAttribute("href", URL);
      const seven = card.getByRole("radio", { name: "7", exact: true });
      await expectHydrated(seven);
      await seven.click();
      await expect(card.getByRole("status").first()).toHaveText(
        fill(text.rounds_rate_saved_score, { score: 7 }),
      );
      await expectAxeClean(page);
    });

    test("the facilitator adds a reference from the board's form, without a data type", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "decide");
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/board`,
      );
      const add = page.getByRole("button", { name: text.board_add });
      await expectHydrated(add);
      await add.click();
      const dialog = page.getByRole("dialog", { name: text.board_add_title });
      await dialog.getByLabel(text.board_name_label, { exact: true }).fill("Body weight");
      await expect(dialog.getByLabel(text.board_reference_title_label)).toHaveCount(0);
      const choice = dialog.getByRole("checkbox", { name: text.board_reference_choice });
      const title = dialog.getByRole("heading");
      const titleBefore = await settledY(title);
      const choiceBefore = await settledY(choice);
      await choice.click();
      // The dialog is anchored to the top and grows downward: nothing above the new fields moves.
      await expect(dialog.getByLabel(text.board_reference_title_label)).toBeVisible();
      expect(await pageY(title)).toBe(titleBefore);
      expect(await pageY(choice)).toBe(choiceBefore);
      await dialog.getByLabel(text.board_reference_title_label).fill("Archetype for body weight");
      await expectAxeClean(page);
      await dialog.getByRole("button", { name: text.board_add }).click();
      await expect(dialog).toHaveCount(0);
      const row = page
        .getByRole("row")
        .filter({ has: page.getByRole("button", { name: "Body weight", exact: true }) });
      await expect(row).toContainText(
        `${text.board_reference_refers_to} Archetype for body weight`,
      );
      // Without a link the title is text, not a link.
      await expect(row.getByRole("link")).toHaveCount(0);
      await expectAxeClean(page);
    });

    test("editing an element in the detail phase swaps the data type for a note", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      const participant = await seedParticipant(db, project);
      await seedElement(db, await userIdOf(db, participant), project.projectId, {
        name: "Heart rate",
      });
      await setPhase(db, project.projectId, "detail");
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/board`,
      );
      // The board is past its editing phases in detail, so it reads as a recap until "Edit anyway".
      const editAnyway = page.getByRole("button", { name: text.common_phase_edit_anyway });
      await expectHydrated(editAnyway);
      await editAnyway.click();
      await page.getByRole("button", { name: "Heart rate", exact: true }).click();
      await page
        .getByRole("button", { name: new RegExp(`^${text.board_edit}`) })
        .first()
        .click();
      const dialog = page.getByRole("dialog");
      const choice = dialog.getByRole("checkbox", { name: text.board_reference_choice });
      await expect(dialog.getByText(text.board_data_type_legend, { exact: true })).toBeVisible();
      const choiceBefore = await settledY(choice);
      await choice.click();
      await expect(dialog.getByText(text.board_data_type_refers_note)).toBeVisible();
      expect(await pageY(choice)).toBe(choiceBefore);
      await expectAxeClean(page);
    });
  });
}
