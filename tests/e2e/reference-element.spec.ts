// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The reference element in English and Dutch (EL26, ADR 0021, Q-ACC-1): a participant adds an
// element that refers to another model on the brainstorm board, the board names the model once
// under the element, and the rating card names it too, under the same question as any element.
// The facilitator adds one from the board's own form, whose title and link open below the choice.
import type { Locator, Page } from "@playwright/test";
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { setPhase } from "../../src/server/test-fixtures.ts";
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

const TITLE = "Zib Bloeddruk";
const URL = "https://models.example.test/zib/bloeddruk";

/** Fills the `{name}` placeholders of a catalogue text. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
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
      await form.getByRole("checkbox", { name: text.board_reference_choice }).click();
      // The title and link open below the choice, so the name field stays where it was.
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
      await dialog.getByRole("checkbox", { name: text.board_reference_choice }).click();
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
  });
}
