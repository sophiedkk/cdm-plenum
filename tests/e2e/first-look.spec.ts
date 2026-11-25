// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The first look in English and Dutch (EL22, ADR 0020): a participant's "Your turn" leads to the
// elements from existing models; they answer one at a time, go back and on, and end at the
// board. The facilitator sees the counts per answer on the board. Every page is axe-clean in
// both themes (Q-ACC-1, Q-I18N-1).
import { insertImportedElement } from "../../src/server/test-fixtures.ts";
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
} from "./fixtures.ts";

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`first look in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("a participant goes through the existing elements; the facilitator sees counts", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      const participant = await seedParticipant(db, project);
      const ids = [
        await insertImportedElement(db, project.projectId, "Systolic"),
        await insertImportedElement(db, project.projectId, "Diastolic"),
      ];

      await signInTo(page, participant, locale, `/projects/${project.projectId}`);
      await expect(
        page.getByRole("heading", { level: 2, name: text.projects_home_turn_first_look }),
      ).toBeVisible();
      const start = page.getByRole("link", { name: text.projects_task_first_look_action });
      await expectHydrated(start);
      await start.click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/first-look"));
      await expect(
        page.getByRole("heading", { level: 2, name: text.board_first_look_title }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: "Systolic" })).toBeVisible();
      await expectAxeCleanInBothThemes(page);

      const question = page.getByRole("group", {
        name: fill(text.board_first_look_question, { concept: "Blood pressure" }),
      });
      // The answers run from low to high, as the rating bands do.
      await expect(question.getByRole("button")).toHaveText([
        text.board_first_look_not_belongs,
        text.board_first_look_not_sure,
        text.board_first_look_belongs,
      ]);
      const belongs = question.getByRole("button", { name: text.board_first_look_belongs });
      await expectHydrated(belongs);
      await belongs.click();
      await expect(belongs).toHaveAttribute("aria-pressed", "true");
      const next = page.getByRole("button", { name: text.board_first_look_next });
      await next.click();
      await expect(page.getByRole("heading", { level: 3, name: "Diastolic" })).toBeVisible();
      await question.getByRole("button", { name: text.board_first_look_not_sure }).click();
      await expect(
        question.getByRole("button", { name: text.board_first_look_not_sure }),
      ).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByRole("complementary").getByText(text.board_first_look_short_belongs),
      ).toBeVisible();
      await expectAxeCleanInBothThemes(page);

      // Previous keeps the answer given.
      await page.getByRole("button", { name: text.board_first_look_previous }).click();
      await expect(belongs).toHaveAttribute("aria-pressed", "true");
      await expect
        .poll(async () => {
          const rows = await db
            .selectFrom("first_look_answer")
            .select("answer")
            .where("element_id", "in", ids)
            .orderBy("answer")
            .execute();
          return rows.map((row) => row.answer);
        })
        .toEqual(["belongs", "not_sure"]);
      await next.click();
      await page.getByRole("link", { name: text.board_first_look_then_add }).first().click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/brainstorm"));

      // The facilitator sees the counts per element on the board.
      await page.context().clearCookies();
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/board`,
      );
      await expect(
        page.getByRole("columnheader", { name: text.board_column_first_look_belongs }),
      ).toBeVisible();
      // Systolic: one "belongs"; Diastolic: one "not sure". No column names who answered.
      const systolic = page
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader", { name: "Systolic" }) });
      await expect(systolic.getByRole("cell")).toContainText(["1", "0", "0"]);
      const diastolic = page
        .getByRole("row")
        .filter({ has: page.getByRole("rowheader", { name: "Diastolic" }) });
      await expect(diastolic.getByRole("cell").nth(-2)).toHaveText("1");
      await expectAxeCleanInBothThemes(page);
    });
  });
}
