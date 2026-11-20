// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project overview in English and Dutch (PR4, PR8, ADR 0013, Q-ACC-1): a participant opens
// a project in the decide phase on one task card whose button leads to the rating, and the
// facilitator moves the project to the next phase after a confirmation in the page.
import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { movePhase } from "../../src/server/projects/phase.ts";
import { saveRating } from "../../src/server/rounds/ratings.ts";
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { insertElement } from "../../src/server/test-fixtures.ts";
import { seedElement, signInTo, userIdOf } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  type SeededProject,
  seedParticipant,
  seedProject,
  test,
} from "./fixtures.ts";

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
async function axeClean(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator("[data-sonner-toast]")
        .evaluateAll((toasts) => toasts.every((toast) => getComputedStyle(toast).opacity === "1")),
    )
    .toBe(true);
  await expectAxeClean(page);
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`project overview in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], viewport: { width: 1280, height: 800 } });
    const text = MESSAGES[locale];

    test("a participant opens the project on the rating task and its button leads there", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
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
      await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}`);
      await expect(page).toHaveTitle(new RegExp(`^${text.projects_overview_title} \\|`));

      const card = page.getByRole("region", { name: text.projects_task_heading });
      await expect(card).toContainText(fill(text.projects_task_rate, { number: 1 }));
      await expect(card).toContainText(
        fill(text.projects_task_rated_count, { rated: 1, total: 2 }),
      );
      await expect(card).toContainText(text.projects_task_closes);
      await expect(page.locator('[aria-current="step"]')).toContainText(text.projects_phase_decide);
      await expect(
        page.getByRole("link", { name: text.projects_tab_overview, exact: true }),
      ).toHaveAttribute("aria-current", "page");
      const rate = card.getByRole("link", {
        name: fill(text.projects_task_rate_action, { number: 1 }),
      });
      // The task fits the first screen (ADR 0013).
      await expect(rate).toBeInViewport();
      await axeClean(page);

      await expectHydrated(rate);
      await rate.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === `/projects/${project.projectId}/rounds/${roundId}/rate`,
      );
      await expectAxeClean(page);
    });

    test("the facilitator moves the project to the next phase after confirming", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      await insertElement(db, project.projectId, "Systolic pressure");
      await signInTo(page, project.facilitator.email, locale, `/projects/${project.projectId}`);

      const current = page.locator('[aria-current="step"]');
      await expect(current).toContainText(text.projects_phase_scope);
      await expect(page.getByText(text.projects_status_elements_one)).toBeVisible();
      await axeClean(page);

      const discover = text.projects_phase_discover;
      const moveOn = page.getByRole("button", {
        name: fill(text.projects_phase_move_next, { phase: discover }),
      });
      await expectHydrated(moveOn);
      await moveOn.click();
      await expect(
        page.getByText(fill(text.projects_phase_confirm_next, { phase: discover })),
      ).toBeFocused();
      await axeClean(page);
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
      await axeClean(page);
      const row = await db
        .selectFrom("project")
        .select("phase")
        .where("id", "=", project.projectId)
        .executeTakeFirstOrThrow();
      expect(row.phase).toBe("discover");
    });
  });
}

test("a participant in the discover phase sees only their own count and goes to the brainstorm", async ({
  page,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db);
  const participant = await seedParticipant(db, project);
  const other = await seedParticipant(db, project);
  const moved = await movePhase(db, project.facilitator.userId, {
    projectId: project.projectId,
    from: "scope",
    direction: "next",
  });
  expect(moved.ok).toBe(true);
  await seedElement(db, await userIdOf(db, participant), project.projectId, { name: "Systolic" });
  await seedElement(db, await userIdOf(db, other), project.projectId, { name: "Cuff size" });
  await seedElement(db, await userIdOf(db, other), project.projectId, { name: "Position" });

  await signInTo(page, participant, "en", `/projects/${project.projectId}`);
  const card = page.getByRole("region", { name: text.projects_task_heading });
  await expect(card).toContainText(text.projects_task_discover_one);
  await expectAxeClean(page);
  const add = card.getByRole("link", { name: text.projects_task_discover_action });
  await expectHydrated(add);
  await add.click();
  await expect(page).toHaveURL(
    (url) => url.pathname === `/projects/${project.projectId}/brainstorm`,
  );
  await expectAxeClean(page);
});
