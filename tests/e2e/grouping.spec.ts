// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Grouping and checking in English and Dutch (EL18, EL24, ADR 0020): the facilitator moves an
// element with the keyboard path and another by dragging, renames and adds a group and asks the
// group to check; a participant marks, says what is missing and finishes; the facilitator reads
// the remarks without names. Every page and dialog is axe-clean (Q-ACC-1, Q-I18N-1).
import type { Kysely } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { addElement } from "../../src/server/elements/queries.ts";
import { addElementInput } from "../../src/server/elements/schemas.ts";
import { insertElement } from "../../src/server/test-fixtures.ts";
import { seedReveal, signInTo, userIdOf } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectAxeCleanAfterToasts,
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

async function add(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  name: string,
  prompt: "recorded" | "patient_state" | "method" | "context",
): Promise<void> {
  const added = await addElement(db, userId, addElementInput.parse({ projectId, name, prompt }));
  if (!added.ok) throw new Error(added.error);
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`grouping in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce" });
    const text = MESSAGES[locale];

    test("the facilitator groups, a participant checks", async ({ page, db }) => {
      test.setTimeout(120_000);
      const project = await seedProject(db, "discover");
      const participant = await seedParticipant(db, project);
      const participantId = await userIdOf(db, participant);
      await add(db, participantId, project.projectId, "Systolic", "recorded");
      await add(db, participantId, project.projectId, "Position", "patient_state");
      await add(db, participantId, project.projectId, "Systolic pressure", "recorded");
      await insertElement(db, project.projectId, "Observer");
      await seedReveal(db, project.facilitator.userId, project.projectId);

      await signInTo(page, project.facilitator.email, locale, `/projects/${project.projectId}`);
      const start = page.getByRole("link", { name: text.projects_check_group_action });
      await expectHydrated(start);
      await start.click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/grouping"));
      await expect(
        page.getByRole("heading", { level: 2, name: text.board_grouping_title }),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: fill(text.board_grouping_pool, { count: 1 }) }),
      ).toBeVisible();
      await expectAxeCleanInBothThemes(page);

      // The keyboard path: pick Observer up, then "Move Observer here" in a group.
      const observer = page.getByRole("button", { name: "Observer", exact: true });
      await expectHydrated(observer);
      await observer.focus();
      await page.keyboard.press("Enter");
      await expect(observer).toHaveAttribute("aria-pressed", "true");
      await expect(
        page.getByText(fill(text.board_grouping_held, { name: "Observer" })),
      ).toBeAttached();
      await expectAxeClean(page);
      const method = page.getByRole("region", { name: new RegExp(text.board_group_method) });
      await method
        .getByRole("button", { name: fill(text.board_grouping_move_here, { name: "Observer" }) })
        .click();
      await expect(method.getByRole("button", { name: "Observer", exact: true })).toBeVisible();
      await expect(
        page.getByRole("heading", { name: fill(text.board_grouping_pool, { count: 0 }) }),
      ).toBeVisible();

      // Drag Position into the situation with the pointer.
      const position = page.getByRole("button", { name: "Position", exact: true });
      const situation = page.getByRole("region", { name: new RegExp(text.board_group_context) });
      const from = await position.boundingBox();
      const to = await situation.boundingBox();
      if (!from || !to) throw new Error("no boxes");
      await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(from.x + 40, from.y + 20, { steps: 4 });
      await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
      await page.mouse.up();
      await expect(situation.getByRole("button", { name: "Position", exact: true })).toBeVisible();
      await expect
        .poll(async () => {
          const rows = await db
            .selectFrom("element")
            .innerJoin("element_group", "element_group.id", "element.group_id")
            .select(["element.name", "element_group.prompt"])
            .where("element.project_id", "=", project.projectId)
            .where("element.name", "in", ["Observer", "Position"])
            .orderBy("element.name")
            .execute();
          return rows.map((row) => `${row.name}:${row.prompt}`);
        })
        .toEqual(["Observer:method", "Position:context"]);

      // Rename a group and add one.
      await page
        .getByRole("button", {
          name: fill(text.board_grouping_rename_named, { name: text.board_group_recorded }),
        })
        .click();
      const rename = page.getByRole("dialog", { name: text.board_grouping_rename_title });
      await rename.getByLabel(text.board_grouping_name_label).fill("The pressure");
      await expectAxeClean(page);
      await rename.getByRole("button", { name: text.board_grouping_save }).click();
      await expect(page.getByRole("heading", { level: 3, name: /The pressure/ })).toBeVisible();
      await page.getByRole("button", { name: text.board_grouping_add }).click();
      const addGroup = page.getByRole("dialog", { name: text.board_grouping_add });
      await addGroup.getByLabel(text.board_grouping_name_label).fill("Device");
      await addGroup.getByRole("button", { name: text.board_grouping_add }).click();
      await expect(page.getByRole("heading", { level: 3, name: /Device/ })).toBeVisible();

      await page.getByRole("button", { name: text.board_grouping_ask }).click();
      await expect(
        page.getByText(fill(text.board_grouping_checking, { checked: 0, participants: 1 })),
      ).toBeVisible();
      await expectAxeCleanAfterToasts(page);

      // The participant checks.
      await page.context().clearCookies();
      await signInTo(page, participant, locale, `/projects/${project.projectId}`);
      await page.getByRole("link", { name: text.projects_task_check_action }).click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/check"));
      // The task bar says the task and counts the remarks, once (P1).
      const bar = page.getByTestId("task-bar");
      await expect(bar).toContainText(text.projects_bar_check);
      await expect(bar.getByRole("status")).toHaveText(text.board_check_remarks_none);
      await expect(bar.getByRole("heading")).toHaveCount(0);
      await expectAxeCleanInBothThemes(page);
      const elsewhere = page.getByRole("button", {
        name: fill(text.board_check_elsewhere_named, { name: "Observer" }),
      });
      await expectHydrated(elsewhere);
      await elsewhere.click();
      await expect(elsewhere).toHaveAttribute("aria-pressed", "true");
      const pressure = page.getByRole("region", { name: "The pressure" });
      await pressure
        .getByRole("button", {
          name: fill(text.board_check_same_named, { name: "Systolic pressure" }),
        })
        .click();
      await pressure
        .getByRole("combobox", { name: text.board_same_as_label })
        .selectOption({ label: "Systolic" });
      await expectAxeClean(page);
      await pressure.getByRole("button", { name: text.board_same_as_submit }).click();
      await expect(page.getByText(fill(text.board_check_remarks_many, { count: 2 }))).toBeVisible();
      await pressure.getByRole("button", { name: text.board_check_missing }).click();
      await pressure
        .getByLabel(fill(text.board_check_missing_label, { group: "The pressure" }))
        .fill("Mean arterial pressure");
      await pressure.getByRole("button", { name: text.board_check_missing_save }).click();
      await expect(page.getByText(fill(text.board_check_remarks_many, { count: 3 }))).toBeVisible();
      await expectAxeCleanAfterToasts(page);
      await page.getByRole("button", { name: text.board_check_done }).click();
      await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}`);

      // Back on the page, the bar is the done state and the groups stay open to change.
      await page.goto(`/projects/${project.projectId}/check`);
      await expect(bar.getByRole("heading", { name: text.projects_bar_done_title })).toBeVisible();
      await expect(bar.getByText(text.projects_bar_check_done)).toBeVisible();
      await expect(bar.getByRole("link", { name: text.projects_back_task })).toBeVisible();
      await expect(page.getByRole("button", { name: text.board_check_done })).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: text.board_check_missing }).first(),
      ).toBeVisible();
      await expectAxeCleanInBothThemes(page);

      // The facilitator reads the remarks, without names.
      await page.context().clearCookies();
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/grouping`,
      );
      await expect(
        page.getByText(fill(text.board_grouping_checking, { checked: 1, participants: 1 })),
      ).toBeVisible();
      await expect(page.getByText("Mean arterial pressure")).toBeVisible();
      await expect(page.getByText(participant)).toHaveCount(0);
      await expectAxeCleanInBothThemes(page);
    });

    test("a finished grouping reads as lists until Edit anyway", async ({ page, db }) => {
      const project = await seedProject(db, "decide");
      await insertElement(db, project.projectId, "Observer");
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/grouping`,
      );
      const banner = page.getByTestId("phase-banner");
      await expect(banner).toBeVisible();
      await expect(page.getByRole("button", { name: "Observer" })).toHaveCount(0);
      await expect(page.getByRole("listitem").filter({ hasText: "Observer" })).toBeVisible();
      await expect(
        page.getByRole("button", {
          name: fill(text.board_grouping_rename_named, { name: text.board_group_recorded }),
        }),
      ).toHaveCount(0);
      await expectAxeClean(page);
      await banner.getByRole("button", { name: text.common_phase_edit_anyway }).click();
      const card = page.getByRole("button", { name: "Observer" });
      await expect(card).toBeVisible();
      await card.click();
      await expect(
        page
          .getByRole("button", { name: fill(text.board_grouping_move_here, { name: "Observer" }) })
          .first(),
      ).toBeVisible();
      await expectAxeClean(page);
    });
  });
}
