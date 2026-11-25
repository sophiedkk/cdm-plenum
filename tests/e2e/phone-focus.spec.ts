// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// UI/UX analysis 2026-11-25, A3 to A5, in English and Dutch: focus moves to the page heading after
// a client-side navigation (WCAG 2.4.3); picking a card on the grouping board moves nothing; the
// round results and the participant's board keep every row's action inside a 390 pixel screen.
import type { Locator, Page } from "@playwright/test";
import { type Kysely, sql } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { closeRound } from "../../src/server/rounds/queries.ts";
import { saveRating } from "../../src/server/rounds/ratings.ts";
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { emailOf, insertElement, joinedParticipant } from "../../src/server/test-fixtures.ts";
import { seedElement, seedReveal, signInTo } from "./board-seed.ts";
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
  uniqueName,
} from "./fixtures.ts";

const PHONE = { width: 390, height: 844 };

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** Whether the element sits inside the viewport sideways. */
async function inViewSideways(locator: Locator): Promise<boolean> {
  const box = await locator.boundingBox();
  return box !== null && box.x >= 0 && box.x + box.width <= PHONE.width;
}

async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** A closed round 1 with three nurses, so the group shows, and two elements. */
async function seedClosedRound(
  db: Kysely<DB>,
): Promise<{ projectId: string; roundId: string; nurse: string }> {
  const project = await seedProject(db, "decide");
  const { projectId } = project;
  const facilitator = project.facilitator.userId;
  const raters: string[] = [];
  for (let index = 0; index < 3; index += 1) {
    raters.push(
      await joinedParticipant(db, facilitator, projectId, "Nursing", uniqueName("rater")),
    );
  }
  const elementIds = [
    await insertElement(db, projectId, "Systolic"),
    await insertElement(db, projectId, "Cuff size"),
  ];
  const roundId = await openedRound(db, facilitator, projectId, {}, "An invented test panel");
  for (const [r, rater] of raters.entries()) {
    for (const [e, elementId] of elementIds.entries()) {
      const saved = await saveRating(db, rater, {
        projectId,
        roundId,
        elementId,
        score: e === 0 ? 9 : 5 + r,
      });
      if (!saved.ok) throw new Error(`rating refused: ${saved.error}`);
    }
  }
  await db.transaction().execute(async (trx) => {
    await sql`set local session_replication_role = replica`.execute(trx);
    await trx
      .updateTable("round")
      .set({ closes_at: new Date(Date.now() - 60_000) })
      .where("id", "=", roundId)
      .execute();
  });
  const closed = await closeRound(db, facilitator, { projectId, roundId }, { now: new Date() });
  if (!closed.ok) throw new Error(`close refused: ${closed.error}`);
  return { projectId, roundId, nurse: emailOf(raters[0] ?? "") };
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  const text = MESSAGES[locale];

  test.describe(`focus after navigation in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], viewport: { width: 1280, height: 800 } });

    test("a tab and a link move focus to the page heading", async ({ page, db }) => {
      const project = await seedProject(db, "decide");
      await signInTo(page, project.facilitator.email, locale, `/projects/${project.projectId}`);
      const tabs = page.getByRole("navigation", { name: text.projects_tabs_label });
      const scope = tabs.getByRole("link", { name: text.projects_tab_scope });
      await expectHydrated(scope);
      await scope.click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/scope"));
      await expect(page.getByRole("heading", { level: 2, name: text.scope_title })).toBeFocused();

      await page.getByRole("link", { name: text.projects_back_projects }).click();
      await expect(page).toHaveURL((url) => url.pathname === "/projects");
      await expect(page.getByRole("heading", { level: 1 })).toBeFocused();
      await expectAxeClean(page);
    });
  });

  test.describe(`grouping board in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce" });

    test("picking a card moves no card and no group", async ({ page, db }) => {
      const project = await seedProject(db, "discover");
      await seedElement(db, project.facilitator.userId, project.projectId, { name: "Systolic" });
      await seedElement(db, project.facilitator.userId, project.projectId, { name: "Position" });
      await insertElement(db, project.projectId, "Observer");
      await seedReveal(db, project.facilitator.userId, project.projectId);
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/grouping`,
      );
      const observer = page.getByRole("button", { name: "Observer", exact: true });
      await expectHydrated(observer);
      const groups = page.getByRole("heading", { level: 3 });
      const before = {
        card: await observer.boundingBox(),
        groups: await groups.evaluateAll((all) => all.map((h) => h.getBoundingClientRect().y)),
      };
      await observer.click();
      await expect(observer).toHaveAttribute("aria-pressed", "true");
      await expect(
        page
          .getByRole("button", { name: fill(text.board_grouping_move_here, { name: "Observer" }) })
          .first(),
      ).toBeVisible();
      expect((await observer.boundingBox())?.y).toBe(before.card?.y);
      const pool = await groups.evaluateAll((all) => all.map((h) => h.getBoundingClientRect().y));
      // The groups in the first row and the pool sit where they were; nothing above moved.
      expect(pool.slice(0, 3)).toEqual(before.groups.slice(0, 3));
      await expectAxeClean(page);
    });
  });

  test.describe(`phone tables in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], viewport: PHONE, reducedMotion: "reduce" });

    test("the round results keep the details button in view", async ({ page, db }) => {
      const seeded = await seedClosedRound(db);
      await signInTo(
        page,
        seeded.nurse,
        locale,
        `/projects/${seeded.projectId}/rounds/${seeded.roundId}`,
      );
      const results = page.getByRole("region", { name: text.rounds_results_heading });
      const details = results.getByRole("button", {
        name: fill(text.rounds_result_details_for, { name: "Systolic" }),
      });
      await expectHydrated(details);
      await expect.poll(() => inViewSideways(details)).toBe(true);
      expect(await scrollsSideways(page)).toBe(false);
      await expectAxeClean(page);
      await details.click();
      await expect(details).toHaveAttribute("aria-expanded", "true");
      expect(await scrollsSideways(page)).toBe(false);
      await expectAxeClean(page);
    });

    test("a participant's board keeps every column of a row in view", async ({ page, db }) => {
      const project = await seedProject(db, "discover");
      const participant = await seedParticipant(db, project);
      await seedElement(db, project.facilitator.userId, project.projectId, {
        name: "Diastolic",
        description: "Lowest pressure in the cycle.",
      });
      await seedReveal(db, project.facilitator.userId, project.projectId);
      await signInTo(page, participant, locale, `/projects/${project.projectId}/board`);
      const row = page.getByRole("table", { name: text.board_list_label }).getByRole("row").nth(1);
      const toggle = row.getByRole("button", { name: "Diastolic", exact: true });
      await expectHydrated(toggle);
      for (const cell of await row.getByRole("cell").all()) {
        await expect.poll(() => inViewSideways(cell)).toBe(true);
      }
      expect(await inViewSideways(toggle)).toBe(true);
      expect(await scrollsSideways(page)).toBe(false);
      await expectAxeClean(page);
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      expect(await scrollsSideways(page)).toBe(false);
      await expectAxeClean(page);
    });
  });
}
