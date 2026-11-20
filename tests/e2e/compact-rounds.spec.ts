// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The compact round views at 1280 by 800 pixels, in English and Dutch (Q-USE-1, DE15, ADR 0013):
// the results of a closed round show 8 elements on the first screen, the round page of an open
// round starts with the call to rate, and the rating screen shows the whole first card on the
// first screen (DE18), with the own earlier score and the distribution but no outcome label.
import type { Locator, Page } from "@playwright/test";
import { type Kysely, sql } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { closeRound } from "../../src/server/rounds/queries.ts";
import { saveRating } from "../../src/server/rounds/ratings.ts";
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { insertElement, joinedParticipant } from "../../src/server/test-fixtures.ts";
import {
  addressOf,
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  requestSignInLink,
  seedProject,
  test,
  uniqueName,
} from "./fixtures.ts";

const SCREEN = { width: 1280, height: 800 };

/** Eight elements; the scores of the six raters in round 1, in the order of RATERS. */
const ELEMENTS: { name: string; scores: number[] }[] = [
  { name: "Systolic", scores: [9, 9, 8, 9, 8, 9] },
  { name: "Diastolic", scores: [9, 8, 8, 9, 9, 7] },
  { name: "Position", scores: [7, 5, 6, 8, 4, 7] },
  { name: "Location of measurement", scores: [8, 8, 7, 9, 7, 8] },
  { name: "Mean arterial pressure", scores: [5, 6, 4, 7, 3, 6] },
  { name: "Cuff size", scores: [6, 7, 5, 8, 4, 7] },
  { name: "Pulse pressure", scores: [2, 3, 1, 2, 2, 3] },
  { name: "Comment", scores: [7, 3, 8, 6, 5, 9] },
];

/** Three nurses, so Nursing shows as a group; two architects and one terminologist do not. */
const RATERS = ["Nursing", "Nursing", "Nursing", "Architecture", "Architecture", "Terminology"];

interface Seeded {
  projectId: string;
  round1: string;
  round2: string;
  facilitator: string;
  nurse: string;
}

/** Moves the closing date into the past with triggers off, as only a test may (see rounds.spec). */
async function passClosingDate(db: Kysely<DB>, roundId: string): Promise<void> {
  await db.transaction().execute(async (trx) => {
    await sql`set local session_replication_role = replica`.execute(trx);
    await trx
      .updateTable("round")
      .set({ closes_at: new Date(Date.now() - 60_000) })
      .where("id", "=", roundId)
      .execute();
  });
}

/** A project with round 1 rated by six raters and closed, and round 2 open on the rest. */
async function seedTwoRounds(db: Kysely<DB>): Promise<Seeded> {
  const project = await seedProject(db);
  const { projectId } = project;
  const facilitator = project.facilitator.userId;
  const names = RATERS.map(() => uniqueName("participant"));
  const raters: string[] = [];
  for (const [index, group] of RATERS.entries()) {
    raters.push(
      await joinedParticipant(db, facilitator, projectId, group, names[index] ?? "participant"),
    );
  }
  const elementIds: string[] = [];
  for (const element of ELEMENTS) elementIds.push(await insertElement(db, projectId, element.name));
  const round1 = await openedRound(db, facilitator, projectId, {}, "An invented test panel");
  for (const [e, element] of ELEMENTS.entries()) {
    for (const [r, score] of element.scores.entries()) {
      const saved = await saveRating(db, raters[r] ?? "", {
        projectId,
        roundId: round1,
        elementId: elementIds[e] ?? "",
        score,
        ...(r === 1 ? { reason: "Recorded at every visit" } : {}),
      });
      if (!saved.ok) throw new Error(`rating refused: ${saved.error}`);
    }
  }
  await passClosingDate(db, round1);
  const closed = await closeRound(
    db,
    facilitator,
    { projectId, roundId: round1 },
    { now: new Date() },
  );
  if (!closed.ok) throw new Error(`close refused: ${closed.error}`);
  const round2 = await openedRound(db, facilitator, projectId, {}, "An invented test panel");
  return {
    projectId,
    round1,
    round2,
    facilitator: project.facilitator.email,
    nurse: addressOf(names[0] ?? ""),
  };
}

async function signInAs(page: Page, email: string, locale: Locale): Promise<void> {
  await page.goto(await requestSignInLink(page, email, locale));
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
}

/** The bottom edge of `element` on the page as loaded, without scrolling. */
async function bottomOf(page: Page, element: Locator): Promise<number> {
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = await element.boundingBox();
  if (!box) throw new Error("element has no box");
  return box.y + box.height;
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`compact round views in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], viewport: SCREEN });
    const text = MESSAGES[locale];
    const fill = (message: string, values: Record<string, string | number>) =>
      message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));

    test("the results show 8 elements on the first screen (Q-USE-1)", async ({ page, db }) => {
      const seeded = await seedTwoRounds(db);
      await signInAs(page, seeded.nurse, locale);
      await page.goto(`/projects/${seeded.projectId}/rounds/${seeded.round1}`);
      const results = page.getByRole("region", { name: text.rounds_results_heading });
      const rows = results.locator("tbody > tr:not([hidden])");
      await expect(rows).toHaveCount(8);
      expect(await bottomOf(page, rows.nth(7))).toBeLessThanOrEqual(SCREEN.height);
      await expect(rows.filter({ hasText: "Systolic" })).toContainText(
        text.rounds_outcome_included,
      );
      await expect(rows.filter({ hasText: "Pulse pressure" })).toContainText(
        text.rounds_outcome_excluded,
      );
      await expectAxeClean(page);
      await page.screenshot({ path: test.info().outputPath(`results-${locale}.png`) });

      // Details open every score and the result of Nursing, the one group of 3 (Q-PRIV-3).
      const details = results.getByRole("button", {
        name: fill(text.rounds_result_details_for, { name: "Systolic" }),
      });
      await expectHydrated(details);
      await details.click();
      await expect(
        results.getByRole("table", {
          name: fill(text.rounds_result_distribution, { name: "Systolic" }),
        }),
      ).toBeVisible();
      const groups = results.getByRole("table", {
        name: fill(text.rounds_result_groups_caption, { name: "Systolic" }),
      });
      await expect(groups.getByRole("rowheader")).toHaveText(["Nursing"]);
      await expectAxeClean(page);
      await page.screenshot({
        path: test.info().outputPath(`results-details-${locale}.png`),
        fullPage: true,
      });

      // The facilitator gets the same rows first, the response after them.
      await page.context().clearCookies();
      await signInAs(page, seeded.facilitator, locale);
      await page.goto(`/projects/${seeded.projectId}/rounds/${seeded.round1}`);
      const facilitatorRows = page
        .getByRole("region", { name: text.rounds_results_heading })
        .locator("tbody > tr:not([hidden])");
      await expect(facilitatorRows).toHaveCount(8);
      expect(await bottomOf(page, facilitatorRows.nth(7))).toBeLessThanOrEqual(SCREEN.height);
      await expect(page.getByRole("heading", { name: text.rounds_progress_heading })).toBeVisible();
      await expectAxeClean(page);
    });

    test("an open round starts with the call to rate, and the rating with the scale (DE15)", async ({
      page,
      db,
    }) => {
      const seeded = await seedTwoRounds(db);
      await signInAs(page, seeded.nurse, locale);
      await page.goto(`/projects/${seeded.projectId}/rounds/${seeded.round2}`);
      const rateNow = page.getByRole("link", { name: fill(text.rounds_rate_now, { number: 2 }) });
      await expect(
        page.getByText(fill(text.rounds_rate_progress, { rated: 0, total: 4 })),
      ).toBeVisible();
      expect(await bottomOf(page, rateNow)).toBeLessThanOrEqual(SCREEN.height);
      // The panel table of the opening is behind the setup disclosure.
      await expect(page.getByRole("heading", { name: text.rounds_snapshot_heading })).toBeHidden();
      await expectAxeClean(page);
      await page.screenshot({ path: test.info().outputPath(`round-open-${locale}.png`) });

      await expectHydrated(rateNow);
      await rateNow.click();
      await expect(page.getByText(text.rounds_rate_hidden_title)).toBeVisible();
      // The first card, Position, fits the first screen whole, with the way to the next card.
      const position = page.getByRole("region", { name: "Position" });
      const firstRadio = position.getByRole("radio").first();
      await expectHydrated(firstRadio);
      expect(await bottomOf(page, firstRadio)).toBeLessThanOrEqual(SCREEN.height);
      expect(await bottomOf(page, position)).toBeLessThanOrEqual(SCREEN.height);
      expect(
        await bottomOf(page, page.getByRole("link", { name: text.rounds_card_next })),
      ).toBeLessThanOrEqual(SCREEN.height);
      // The own earlier score and the distribution, without an outcome label of round 1.
      await expect(position).toContainText(
        fill(text.rounds_rate_previous_own_value, { number: 1, value: 7 }),
      );
      const distribution = position.getByRole("list", {
        name: fill(text.rounds_rate_previous_distribution, { number: 1, name: "Position" }),
      });
      await expect(distribution).toContainText("Nursing");
      // Two architects and one terminologist: below the minimum of 3 (Q-PRIV-3).
      await expect(position).not.toContainText("Architecture");
      await expect(position).not.toContainText("Terminology");
      for (const label of [
        text.rounds_outcome_included,
        text.rounds_outcome_excluded,
        text.rounds_outcome_no_consensus,
      ]) {
        await expect(page.getByRole("main")).not.toContainText(label);
      }
      await expectAxeClean(page);
      await page.screenshot({ path: test.info().outputPath(`rate-${locale}.png`) });

      await position.getByText(fill(text.rounds_rate_previous_details, { count: 1 })).click();
      await expect(position).toContainText("Recorded at every visit");
      await expect(position).toContainText(text.rounds_result_top_band);
      await expectAxeClean(page);
      await page.screenshot({
        path: test.info().outputPath(`rate-details-${locale}.png`),
        fullPage: true,
      });
    });
  });
}
