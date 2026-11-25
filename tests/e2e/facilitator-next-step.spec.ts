// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's next step (F1, F3 of the UI/UX analysis of 2026-11-25): the first open item
// of the Overview is the one filled button and the phase move names what stays open; the pages
// of a finished phase read as a recap under a banner until "Edit anyway"; the rounds are a list.
import { closedNow, openedRound } from "../../src/server/rounds/test-round.ts";
import { insertElement } from "../../src/server/test-fixtures.ts";
import { signInTo } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedProject,
  test,
} from "./fixtures.ts";

/** Fills the `{name}` placeholders of a catalogue text. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`the facilitator's next step in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce" });
    const text = MESSAGES[locale];

    test("the first open item is the filled button and the move names what stays open", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "scope");
      await signInTo(page, project.facilitator.email, locale, `/projects/${project.projectId}`);
      const toScope = page.getByRole("link", { name: text.projects_check_scope_action });
      await expectHydrated(toScope);
      await expect(toScope).toHaveAttribute("data-variant", "default");
      await expect(page.getByRole("link", { name: text.projects_check_invite })).toHaveAttribute(
        "data-variant",
        "outline",
      );
      const goOn = page.getByRole("button", {
        name: fill(text.projects_phase_move_next, { phase: text.projects_phase_discover }),
      });
      await expect(goOn).toHaveAttribute("data-variant", "outline");
      await goOn.click();
      const confirm = page.getByRole("group");
      await expect(confirm.getByText(text.projects_phase_confirm_open)).toBeVisible();
      await expect(confirm.getByRole("listitem").first()).toHaveText(
        text.projects_check_scope_write,
      );
      await expectAxeClean(page);

      await toScope.click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/scope"));
    });

    test("a finished phase reads as a recap until Edit anyway", async ({ page, db }) => {
      const project = await seedProject(db, "decide");
      const base = `/projects/${project.projectId}`;
      await signInTo(page, project.facilitator.email, locale, `${base}/scope`);
      const banner = page.getByTestId("phase-banner");
      await expect(banner).toContainText(text.common_phase_finished);
      await expect(page.getByRole("button", { name: text.scope_edit })).toHaveCount(0);
      await expectAxeClean(page);
      const editAnyway = banner.getByRole("button", { name: text.common_phase_edit_anyway });
      await expectHydrated(editAnyway);
      await editAnyway.click();
      await expect(banner).toHaveCount(0);
      await expect(page.getByRole("button", { name: text.scope_edit })).toBeVisible();
      await expectAxeClean(page);

      await page.goto(`${base}/models`);
      await expect(page.getByTestId("phase-banner")).toBeVisible();
      await expect(page.getByRole("button", { name: text.board_models_add_title })).toHaveCount(0);
      await expectAxeClean(page);
      await page.getByRole("button", { name: text.common_phase_edit_anyway }).click();
      await expect(page.getByRole("button", { name: text.board_models_add_title })).toBeVisible();

      // The board is edited in discover and decide, so decide shows no banner.
      await page.goto(`${base}/board`);
      await expect(page.getByRole("button", { name: text.board_add })).toBeVisible();
      await expect(page.getByTestId("phase-banner")).toHaveCount(0);
    });

    test("the rounds are a list with one link per round, and no new round in detail", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "decide");
      const { projectId } = project;
      await insertElement(db, projectId, "Systolic pressure");
      const round = await openedRound(
        db,
        project.facilitator.userId,
        projectId,
        {},
        "An invented test panel",
      );
      await closedNow(db, project.facilitator.userId, projectId, round);
      await signInTo(page, project.facilitator.email, locale, `/projects/${projectId}/rounds`);
      const list = page.getByRole("list", { name: text.rounds_table_caption });
      const name = fill(text.rounds_round_name, { number: 1 });
      await expect(list.getByRole("listitem")).toHaveCount(1);
      await expect(list.getByRole("link")).toHaveCount(1);
      await expect(list.getByRole("link", { name })).toBeVisible();
      await expect(page.getByRole("link", { name: text.rounds_new })).toBeVisible();
      await expect(page.getByTestId("phase-banner")).toHaveCount(0);
      await expectAxeClean(page);

      await db
        .updateTable("project")
        .set({ phase: "detail" })
        .where("id", "=", projectId)
        .execute();
      await page.reload();
      await expect(page.getByTestId("phase-banner")).toBeVisible();
      await expect(page.getByRole("link", { name: text.rounds_new })).toHaveCount(0);
      await expect(list.getByRole("link", { name })).toBeVisible();
      await expectAxeClean(page);
      const editAnyway = page.getByRole("button", { name: text.common_phase_edit_anyway });
      await expectHydrated(editAnyway);
      await editAnyway.click();
      await expect(page.getByRole("link", { name: text.rounds_new })).toBeVisible();
    });
  });
}
