// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The tree of the model in English and Dutch (DT6, ADR 0021). An architect proposes the tree:
// adds a group and puts it inside another with the "Part of" select (the keyboard path), marks it
// a sub-block linked to an existing one, places an element in it and marks a registration
// element. A participant agrees, the facilitator settles, and the Details page and the elements
// CSV show the tree. Every page is axe-clean in both themes (Q-ACC-1, Q-I18N-1).
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import {
  closedRoundWithOutcomes,
  emailOf,
  insertElement,
  joinedParticipant,
} from "../../src/server/test-fixtures.ts";
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
  uniqueName,
} from "./fixtures.ts";

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

async function switchUser(page: Page, email: string, locale: Locale, path: string) {
  await page.context().clearCookies();
  await signInTo(page, email, locale, path);
}

const LINK = "https://models.example.test/cuff";

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`the tree of the model in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("an architect proposes the tree, a participant agrees, the facilitator settles", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "detail");
      const participant = await seedParticipant(db, project);
      const architect = emailOf(
        await joinedParticipant(
          db,
          project.facilitator.userId,
          project.projectId,
          "Architecture",
          uniqueName("architect"),
        ),
      );
      const systolic = await insertElement(db, project.projectId, "Systolic");
      const cuffSize = await insertElement(db, project.projectId, "Cuff size");
      const author = await insertElement(db, project.projectId, "Author");
      const recorded = await db
        .selectFrom("element_group")
        .select("id")
        .where("project_id", "=", project.projectId)
        .where("prompt", "=", "recorded")
        .executeTakeFirstOrThrow();
      await db
        .updateTable("element")
        .set({ group_id: recorded.id })
        .where("id", "in", [systolic, cuffSize])
        .execute();
      await closedRoundWithOutcomes(db, project.projectId, [
        [systolic, "included"],
        [cuffSize, "included"],
        [author, "included"],
      ]);
      const detailsUrl = `/projects/${project.projectId}/details`;
      const measurement = text.board_group_recorded;
      const treeOf = (page: Page) => page.getByRole("region", { name: text.details_tree });

      // The architect opens the editor below its button and builds the tree.
      await signInTo(page, architect, locale, detailsUrl);
      await expect(treeOf(page)).toContainText(text.details_no_proposal);
      await expectAxeCleanInBothThemes(page);
      const proposeButton = treeOf(page).getByRole("button", { name: text.details_tree_propose });
      await expectHydrated(proposeButton);
      await proposeButton.click();
      await expect(proposeButton).toHaveAttribute("aria-expanded", "true");
      const editor = treeOf(page);
      await editor.getByRole("button", { name: text.details_tree_add_group }).click();
      const name = editor.getByLabel(text.details_tree_new_group_name);
      await expect(name).toBeFocused();
      await name.fill("Cuff");
      const partOf = editor.getByLabel(`${text.details_tree_part_of}: Cuff`);
      await partOf.focus();
      await partOf.selectOption({ label: measurement });
      await expect(partOf).toBeFocused();
      const cardinality = editor.getByRole("group", {
        name: new RegExp(`^${text.board_cardinality_legend}\\s*: Cuff$`),
      });
      await cardinality.getByLabel(text.board_min_label).selectOption("0");
      await cardinality.getByLabel(text.board_max_label).selectOption("1");
      await editor.getByLabel(`${text.details_tree_sub_block}: Cuff`).check();
      await editor.getByLabel(text.details_tree_link_title).fill("Cuff cluster");
      await editor.getByLabel(text.details_tree_link_url).fill(LINK);
      await editor
        .getByLabel(fill(text.details_tree_group_of, { name: "Cuff size" }))
        .selectOption({ label: `${measurement} > Cuff` });
      await editor.getByLabel(`${text.details_tree_registration}: Author`).check();
      // Author joins Systolic in the measurement and moves above it (the order within a group).
      await editor
        .getByLabel(fill(text.details_tree_group_of, { name: "Author" }))
        .selectOption({ label: measurement });
      const moveAuthorUp = editor.getByRole("button", {
        name: new RegExp(`^${text.details_tree_move_up}\\s*: Author$`),
      });
      await moveAuthorUp.click();
      await expect(moveAuthorUp).toBeDisabled();
      await expectAxeCleanInBothThemes(page);
      await editor.getByRole("button", { name: text.details_propose_submit }).click();
      await expect(treeOf(page)).toContainText(fill(text.details_by_architecture, { version: 1 }));

      // A participant reads the proposed tree and agrees.
      await switchUser(page, participant, locale, detailsUrl);
      const tree = treeOf(page).getByRole("list", { name: text.details_tree });
      await expect(tree).toContainText("Cuff cluster");
      const agree = treeOf(page).getByRole("button", {
        name: new RegExp(`^${text.details_agree}`),
      });
      await expectHydrated(agree);
      await agree.click();
      await expect(treeOf(page)).toContainText(text.details_own_agreed);
      await expectAxeCleanInBothThemes(page);

      // The facilitator settles; the tree is now on the groups and elements.
      await switchUser(page, project.facilitator.email, locale, detailsUrl);
      await expect(treeOf(page)).toContainText(
        fill(text.details_answers_count, { agreed: 1, objections: 0 }),
      );
      const settle = treeOf(page).getByRole("button", { name: new RegExp(text.details_settle) });
      await expectHydrated(settle);
      await settle.click();
      await expect(treeOf(page)).toContainText(text.details_status_settled);
      const cuffItem = treeOf(page)
        .getByRole("listitem")
        .filter({ hasText: "Cuff cluster" })
        .last();
      await expect(cuffItem).toContainText("0..1");
      await expect(cuffItem).toContainText(text.details_tree_sub_block);
      await expect(cuffItem).toContainText("Cuff size");
      const measurementItem = treeOf(page)
        .getByRole("listitem")
        .filter({ hasText: "Author" })
        .first();
      await expect(measurementItem).toContainText(/Author[\s\S]*Systolic/);
      await expect(
        treeOf(page).getByRole("listitem").filter({ hasText: "Author" }).last(),
      ).toContainText(text.details_tree_registration);
      await expectAxeCleanInBothThemes(page);

      // The elements CSV carries the path, the cardinality, the sub-block and the flag.
      await page.goto(`/projects/${project.projectId}/export`);
      const download = page.getByRole("button", {
        name: fill(text.export_download, { name: text.export_elements_title }),
        exact: true,
      });
      await expectHydrated(download);
      const downloading = page.waitForEvent("download");
      await download.click();
      const content = await readFile(await (await downloading).path(), "utf8");
      const lines = content.split("\r\n");
      expect(lines.find((line) => line.startsWith('"Cuff size"'))).toContain(
        `"The measurement > Cuff","0..1","Cuff cluster <${LINK}>",`,
      );
      expect(lines.find((line) => line.startsWith('"Author"'))).toContain(',"yes"');
    });
  });
}
