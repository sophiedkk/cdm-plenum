// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Groups in a round in English and Dutch (DE19, ADR 0020): the rating card names the element's
// group, and the overview lists the ratings under group headings, the elements of one group
// together. Axe-clean in both themes (Q-ACC-1, Q-I18N-1).
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { insertElement } from "../../src/server/test-fixtures.ts";
import { signInTo } from "./board-seed.ts";
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

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`groups in a round in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("the card names the group and the overview lists ratings under group headings", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "decide");
      const participant = await seedParticipant(db, project);
      const groups = await db
        .selectFrom("element_group")
        .select(["id", "prompt"])
        .where("project_id", "=", project.projectId)
        .execute();
      const groupOf = (prompt: string) => groups.find((group) => group.prompt === prompt)?.id;
      for (const [name, prompt] of [
        ["Systolic pressure", "recorded"],
        ["Cuff size", "method"],
        ["Diastolic pressure", "recorded"],
      ] as const) {
        const id = await insertElement(db, project.projectId, name);
        await db
          .updateTable("element")
          .set({ group_id: groupOf(prompt) ?? null })
          .where("id", "=", id)
          .execute();
      }
      const roundId = await openedRound(
        db,
        project.facilitator.userId,
        project.projectId,
        {},
        "An invented test panel",
      );

      await signInTo(
        page,
        participant,
        locale,
        `/projects/${project.projectId}/rounds/${roundId}/rate`,
      );
      const card = page
        .getByRole("region")
        .filter({ has: page.getByRole("heading", { level: 3 }) });
      await expect(card.first()).toBeVisible();
      const groupNames = [text.board_group_recorded, text.board_group_method];
      await expect(card.first().getByText(new RegExp(groupNames.join("|")))).toBeVisible();
      await expectAxeCleanInBothThemes(page);

      await page.goto(`/projects/${project.projectId}/rounds/${roundId}/rate?card=overview`);
      const overview = page.getByRole("region", { name: text.rounds_overview_heading });
      const headers = overview.getByRole("columnheader").filter({ hasText: /./ });
      await expect(
        overview.getByRole("columnheader", { name: text.board_group_recorded }),
      ).toBeVisible();
      await expect(
        overview.getByRole("columnheader", { name: text.board_group_method }),
      ).toBeVisible();
      // The two elements of the measurement follow its heading, one after the other.
      const rows = await overview.getByRole("row").allTextContents();
      const at = rows.findIndex((row) => row.trim() === text.board_group_recorded);
      expect(rows[at + 1]).toContain("Systolic pressure");
      expect(rows[at + 2]).toContain("Diastolic pressure");
      expect(await headers.count()).toBeGreaterThan(2);
      await expectAxeCleanInBothThemes(page);
    });
  });
}
