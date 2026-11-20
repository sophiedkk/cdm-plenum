// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project header in English and Dutch (PR4, PR8, PR11, ADR 0018, Q-ACC-1): the project URL
// opens the current step's page; a participant sees the steps and the task line on every project
// page they can open, and its button leads to the task; the facilitator moves the project to the
// next phase after a confirmation in the header. Axe-clean in the light and the dark theme.
import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import { visibleSteps } from "../../src/lib/phase-access.ts";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { movePhase } from "../../src/server/projects/phase.ts";
import { saveRating } from "../../src/server/rounds/ratings.ts";
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { insertElement } from "../../src/server/test-fixtures.ts";
import { seedElement, seedScope, signInTo, userIdOf } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectAxeCleanInBothThemes,
  expectHydrated,
  type Locale,
  MESSAGES,
  type SeededProject,
  seedParticipant,
  seedProject,
  test,
} from "./fixtures.ts";

type Text = (typeof MESSAGES)[Locale];

/** Fills a message's `{placeholders}`, as Paraglide does. */
function fill(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** Moves the project from scope to decide through the facilitator's own server function. */
async function toDecide(db: Kysely<DB>, project: SeededProject): Promise<void> {
  const { projectId, facilitator } = project;
  for (const from of ["scope", "discover"] as const) {
    const moved = await movePhase(db, facilitator.userId, { projectId, from, direction: "next" });
    if (!moved.ok) throw new Error(`movePhase refused: ${moved.error}`);
  }
}

/** Waits until every toast has finished its entry animation, then runs the axe check. */
async function toastsSettled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator("[data-sonner-toast]")
        .evaluateAll((toasts) => toasts.every((toast) => getComputedStyle(toast).opacity === "1")),
    )
    .toBe(true);
}

/** The row of steps in the header, with the current one marked. */
function steps(page: Page, text: Text) {
  return page.getByRole("list", { name: text.projects_steps_label });
}

/** The tab of a project step. */
function tab(page: Page, text: Text, name: string) {
  return page.getByRole("navigation", { name: text.projects_tabs_label }).getByRole("link", {
    name,
    exact: true,
  });
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`project header in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], viewport: { width: 1280, height: 800 } });
    const text = MESSAGES[locale];

    test("a participant opens the project on the rating step and the task button leads there", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      await seedScope(db, project.facilitator.userId, project.projectId, {
        concept: "The pressure of the blood in the large arteries",
        useCases: "",
        outOfScope: "",
      });
      const systolic = await insertElement(db, project.projectId, "Systolic pressure");
      await insertElement(db, project.projectId, "Cuff size");
      const participant = await seedParticipant(db, project);
      await toDecide(db, project);
      const roundId = await openedRound(
        db,
        project.facilitator.userId,
        project.projectId,
        {},
        "A small panel",
      );
      const rated = await saveRating(db, await userIdOf(db, participant), {
        projectId: project.projectId,
        roundId,
        elementId: systolic,
        score: 7,
      });
      expect(rated.ok).toBe(true);

      await signInTo(page, participant, locale, "/projects");
      await page.getByRole("link", { name: "Blood pressure" }).click();
      await expect(page).toHaveURL(
        (url) => url.pathname === `/projects/${project.projectId}/rounds`,
      );
      await expect(page).toHaveTitle(new RegExp(`^${text.rounds_title} \\|`));
      await expect(page.getByRole("heading", { level: 1, name: "Blood pressure" })).toBeVisible();
      await expect(page.getByTestId("project-scope-line")).toHaveText(
        "The pressure of the blood in the large arteries",
      );

      const task = page.getByRole("region", { name: text.projects_task_heading });
      await expect(task).toContainText(fill(text.projects_task_rate, { number: 1 }));
      await expect(task).toContainText(
        fill(text.projects_task_rated_count, { rated: 1, total: 2 }),
      );
      await expect(task).toContainText(text.projects_task_closes);
      await expect(steps(page, text).locator('[aria-current="step"]')).toContainText(
        text.projects_phase_decide,
      );
      await expect(tab(page, text, text.projects_tab_rounds)).toHaveAttribute(
        "aria-current",
        "page",
      );
      const rate = task.getByRole("link", {
        name: fill(text.projects_task_rate_action, { number: 1 }),
      });
      // The task fits the first screen (ADR 0013).
      await expect(rate).toBeInViewport();
      await expectAxeCleanInBothThemes(page);

      await expectHydrated(rate);
      await rate.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === `/projects/${project.projectId}/rounds/${roundId}/rate`,
      );
      // The rating screen opens on the first card (DE18), under the same header, whose task
      // line keeps its sentence but has no button to the page it is on.
      await expect(page.getByRole("region", { name: "Systolic pressure" })).toBeVisible();
      const onRating = page.getByRole("region", { name: text.projects_task_heading });
      await expect(onRating).toContainText(fill(text.projects_task_rate, { number: 1 }));
      await expect(onRating.getByRole("link")).toHaveCount(0);
      await expectAxeClean(page);
    });

    test("a participant sees the steps and the task line on every page they can open", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      const participant = await seedParticipant(db, project);
      await seedElement(db, await userIdOf(db, participant), project.projectId, {
        name: "Systolic",
      });
      await signInTo(page, participant, locale, `/projects/${project.projectId}`);
      // The project opens on the step of the participant's task.
      await expect(page).toHaveURL(
        (url) => url.pathname === `/projects/${project.projectId}/brainstorm`,
      );
      const names: Record<string, string> = {
        brainstorm: text.projects_tab_brainstorm,
        board: text.projects_tab_board,
        scope: text.projects_tab_scope,
        members: text.projects_tab_members,
      };
      for (const step of visibleSteps("participant", "discover")) {
        const link = tab(page, text, names[step] ?? step);
        await expectHydrated(link);
        await link.click();
        await expect(link).toHaveAttribute("aria-current", "page");
        await expect(steps(page, text).locator('[aria-current="step"]')).toContainText(
          text.projects_phase_discover,
        );
        const task = page.getByRole("region", { name: text.projects_task_heading });
        await expect(task).toContainText(text.projects_task_discover);
        await expect(task).toContainText(text.projects_task_discover_one);
        // The button leads to the brainstorm, so the brainstorm itself shows none.
        await expect(
          task.getByRole("link", { name: text.projects_task_discover_action }),
        ).toHaveCount(step === "brainstorm" ? 0 : 1);
      }
      await expectAxeCleanInBothThemes(page);

      // The facilitator's pages send a participant back to the current step.
      for (const hidden of ["export", "settings"]) {
        await page.goto(`/projects/${project.projectId}/${hidden}`);
        await expect(page).toHaveURL(
          (url) => url.pathname === `/projects/${project.projectId}/brainstorm`,
        );
      }
    });

    test("the facilitator moves the project to the next phase after confirming", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      await insertElement(db, project.projectId, "Systolic pressure");
      await signInTo(page, project.facilitator.email, locale, `/projects/${project.projectId}`);
      // The facilitator's project opens on the main page of the phase.
      await expect(page).toHaveURL(
        (url) => url.pathname === `/projects/${project.projectId}/scope`,
      );

      const current = steps(page, text).locator('[aria-current="step"]');
      await expect(current).toContainText(text.projects_phase_scope);
      const status = page.getByRole("region", { name: text.projects_status_heading });
      await expect(status).toContainText(text.projects_status_elements_one);
      await expect(tab(page, text, text.projects_tab_settings)).toBeVisible();
      await expectAxeCleanInBothThemes(page);

      const discover = text.projects_phase_discover;
      const moveOn = page.getByRole("button", {
        name: fill(text.projects_phase_move_next, { phase: discover }),
      });
      await expectHydrated(moveOn);
      await moveOn.click();
      await expect(
        page.getByText(fill(text.projects_phase_confirm_next, { phase: discover })),
      ).toBeFocused();
      await expectAxeClean(page);
      await page
        .getByRole("button", { name: fill(text.projects_phase_confirm, { phase: discover }) })
        .click();

      await expect(
        page.getByText(fill(text.projects_phase_moved, { phase: discover })),
      ).toBeVisible();
      await expect(current).toContainText(discover);
      await expect(
        page.getByRole("button", {
          name: fill(text.projects_phase_move_previous, { phase: text.projects_phase_scope }),
        }),
      ).toBeVisible();
      await toastsSettled(page);
      await expectAxeClean(page);
      const row = await db
        .selectFrom("project")
        .select("phase")
        .where("id", "=", project.projectId)
        .executeTakeFirstOrThrow();
      expect(row.phase).toBe("discover");
    });
  });
}

test("the header takes no more height than the name, badges and tabs did (ADR 0018)", async ({
  page,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db, "discover");
  await signInTo(page, project.facilitator.email, "en", `/projects/${project.projectId}/board`);
  const heading = page.getByRole("heading", { level: 1, name: "Blood pressure" });
  const nav = page.getByRole("navigation", { name: text.projects_tabs_label });
  const top = (await heading.boundingBox())?.y ?? 0;
  const bottom = await nav.evaluate((node) => node.getBoundingClientRect().bottom);
  // The old header: a 32 px name, 8 px gap, 24 px badges, 16 px margin and 37 px of tabs.
  expect(bottom - top).toBeLessThanOrEqual(32 + 8 + 24 + 16 + 37);
});
