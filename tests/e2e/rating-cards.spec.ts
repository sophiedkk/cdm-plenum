// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Rating card by card at 1280 by 800 pixels, in English and Dutch (DE1, DE17, DE18, Q-ACC-1,
// Q-USE-1): a participant rates three elements one card at a time, goes back a card and changes
// a score, keeps the card through a reload and the back button, and checks every rating on the
// overview. No screen shows a data type or a detail flag before the detail phase (EL21), not even
// a stored flag. In round 2 the card shows the own score of round 1 on the distribution and above
// the scale, and the reasons of round 1 (DE8, DE15); the participant rates with the keys and
// jumps to a card by its dot, in light and dark.
import { randomBytes } from "node:crypto";
import type { Browser, BrowserContextOptions, Locator, Page } from "@playwright/test";
import { type Kysely, sql } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { saveDetailFlag } from "../../src/server/rounds/flags.ts";
import { closeRound } from "../../src/server/rounds/queries.ts";
import { saveRating } from "../../src/server/rounds/ratings.ts";
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { emailOf, insertElement, joinedParticipant } from "../../src/server/test-fixtures.ts";
import { expectAxeCleanAfterToasts } from "./axe.ts";
import { userIdOf } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  requestSignInLink,
  seedParticipant,
  seedProject,
  test,
  uniqueName,
} from "./fixtures.ts";
import { appUrl } from "./run-env.ts";

const SCREEN = { width: 1280, height: 800 };

/** Fills a message's `{placeholders}`, as Paraglide does. */
function fill(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** A signed-in page for `email` at 1280 by 800, in a context with its own client address. */
async function pageFor(
  browser: Browser,
  locale: Locale,
  email: string,
  device: BrowserContextOptions = {},
): Promise<Page> {
  const [a, b, c] = randomBytes(3);
  const context = await browser.newContext({
    baseURL: appUrl(),
    locale: BROWSER_LOCALE[locale],
    viewport: SCREEN,
    extraHTTPHeaders: { "X-Forwarded-For": `10.${a}.${b}.${c}` },
    ...device,
  });
  const page = await context.newPage();
  await page.goto(await requestSignInLink(page, email, locale));
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
  return page;
}

/** The bottom edge of `element` on the page as loaded, without scrolling. */
async function bottomOf(page: Page, element: Locator): Promise<number> {
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  const box = await element.boundingBox();
  if (!box) throw new Error("element has no box");
  return box.y + box.height;
}

const ELEMENTS = ["Systolic pressure", "Cuff size", "Body position"] as const;

/** Round 1 scores per element, in the order of the four nurses; the first nurse rates round 2. */
const ROUND_1 = [
  { name: "Systolic pressure", scores: [6, 8, 9, 5] },
  { name: "Cuff size", scores: [4, 7, 7, 5] },
] as const;

/** One invented reason per nurse for the first element: one more than the card shows at first. */
const REASONS = [
  "Needed to judge the reading",
  "Part of every protocol",
  "Recorded at every visit",
  "Used in research exports",
];

/** A project with round 1 rated by four nurses and closed, and round 2 open on the same elements. */
async function seedRoundTwo(db: Kysely<DB>) {
  const project = await seedProject(db, "decide");
  const { projectId } = project;
  const facilitator = project.facilitator.userId;
  const names = REASONS.map(() => uniqueName("nurse"));
  const raters: string[] = [];
  for (const name of names) {
    raters.push(await joinedParticipant(db, facilitator, projectId, "Nursing", name));
  }
  const elementIds: string[] = [];
  for (const element of ROUND_1) elementIds.push(await insertElement(db, projectId, element.name));
  const round1 = await openedRound(db, facilitator, projectId, {}, "An invented test panel");
  for (const [e, element] of ROUND_1.entries()) {
    for (const [r, score] of element.scores.entries()) {
      const saved = await saveRating(db, raters[r] ?? "", {
        projectId,
        roundId: round1,
        elementId: elementIds[e] ?? "",
        score,
        ...(e === 0 ? { reason: REASONS[r] } : {}),
      });
      if (!saved.ok) throw new Error(`rating refused: ${saved.error}`);
    }
  }
  // Moves the closing date into the past with triggers off, as only a test may (see rounds.spec).
  await db.transaction().execute(async (trx) => {
    await sql`set local session_replication_role = replica`.execute(trx);
    await trx
      .updateTable("round")
      .set({ closes_at: new Date(Date.now() - 60_000) })
      .where("id", "=", round1)
      .execute();
  });
  const closed = await closeRound(
    db,
    facilitator,
    { projectId, roundId: round1 },
    { now: new Date() },
  );
  if (!closed.ok) throw new Error(`close refused: ${closed.error}`);
  const round2 = await openedRound(db, facilitator, projectId, {}, "An invented test panel");
  return { projectId, round2, nurse: emailOf(raters[0] ?? "") };
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`rating cards in ${locale}`, () => {
    const text = MESSAGES[locale];

    test("a participant rates card by card and changes a score, with no details or flags shown", async ({
      db,
      browser,
    }) => {
      test.setTimeout(120_000);
      const project = await seedProject(db, "decide");
      const { projectId } = project;
      const participant = await seedParticipant(db, project);
      const ids: string[] = [];
      for (const name of ELEMENTS) ids.push(await insertElement(db, projectId, name));
      await db
        .updateTable("element")
        .set({ data_type: "text", min_occurs: 0, max_occurs: 1 })
        .where("id", "=", ids[0] ?? "")
        .execute();
      const roundId = await openedRound(
        db,
        project.facilitator.userId,
        projectId,
        {},
        "An invented test panel",
      );
      const ratePath = `/projects/${projectId}/rounds/${roundId}/rate`;
      // A flag from before the switch: the screens must not show it either.
      const flagged = await saveDetailFlag(db, await userIdOf(db, participant), {
        projectId,
        roundId,
        elementId: ids[0] ?? "",
        kind: "data_type",
        reason: "A blood pressure is a quantity in mmHg",
      });
      expect(flagged.ok).toBe(true);

      const rater = await pageFor(browser, locale, participant);
      await rater.goto(ratePath);
      const card = (name: string) => rater.getByRole("region", { name });
      const heading = (name: string) => rater.getByRole("heading", { level: 3, name });
      const next = rater.getByRole("link", { name: text.rounds_card_next });
      const previous = rater.getByRole("link", { name: text.rounds_card_previous });
      const saved = async (name: string, score: number) =>
        expect(card(name).getByRole("status").first()).toHaveText(
          fill(text.rounds_rate_saved_score, { score }),
        );

      // Card 1 of 3 fits the first screen; data type, cardinality and values wait for their phase.
      const first = card("Systolic pressure");
      await expect(first).toContainText(fill(text.rounds_card_position, { index: 1, total: 3 }));
      const seven = first.getByRole("radio", { name: "7", exact: true });
      await expectHydrated(seven);
      expect(await bottomOf(rater, first)).toBeLessThanOrEqual(SCREEN.height);
      expect(await bottomOf(rater, next)).toBeLessThanOrEqual(SCREEN.height);
      await expect(first.getByText(text.rounds_card_details_summary)).toHaveCount(0);
      await expect(first.getByText(/DV_TEXT/)).toHaveCount(0);
      await expect(
        first.getByRole("button", { name: new RegExp(text.rounds_flag_open) }),
      ).toHaveCount(0);
      await seven.click();
      await saved("Systolic pressure", 7);
      // With "Remove my answer" shown after the choice, the card still fits.
      expect(await bottomOf(rater, next)).toBeLessThanOrEqual(SCREEN.height);
      await expectAxeClean(rater);
      await rater.screenshot({ path: test.info().outputPath(`card-${locale}.png`) });

      await expectAxeCleanAfterToasts(rater);

      // Next moves to card 2, then card 3, focus on each heading.
      await next.click();
      await expect(heading("Cuff size")).toBeFocused();
      await expect(card("Cuff size")).toContainText(
        fill(text.rounds_card_position, { index: 2, total: 3 }),
      );
      await card("Cuff size")
        .getByRole("radio", { name: fill(text.rounds_rate_score_highest, { score: 9 }) })
        .click();
      await saved("Cuff size", 9);
      await next.click();
      await expect(heading("Body position")).toBeFocused();
      await card("Body position").getByRole("radio", { name: "3", exact: true }).click();
      await saved("Body position", 3);

      // Back one card, and the score changes from 9 to 5.
      await previous.click();
      await expect(heading("Cuff size")).toBeFocused();
      await expect(
        card("Cuff size").getByRole("radio", {
          name: fill(text.rounds_rate_score_highest, { score: 9 }),
        }),
      ).toBeChecked();
      await card("Cuff size").getByRole("radio", { name: "5", exact: true }).click();
      await saved("Cuff size", 5);

      // The card is in the URL: a reload keeps it, and the back button returns to card 3.
      await expect(rater).toHaveURL((url) => url.searchParams.get("card") === "2");
      await rater.reload();
      await expect(card("Cuff size").getByRole("radio", { name: "5", exact: true })).toBeChecked();
      await rater.goBack();
      await expect(card("Body position")).toBeVisible();

      // After the last card the overview lists every rating, with a link back to each card.
      await expectHydrated(next);
      await next.click();
      await expect(heading(text.rounds_overview_heading)).toBeFocused();
      const overview = rater.getByRole("region", { name: text.rounds_overview_heading });
      // The rating screen holds the count once; the overview does not repeat it.
      await expect(
        rater.getByText(fill(text.rounds_rate_progress, { rated: 3, total: 3 })),
      ).toHaveCount(1);
      const rows = overview.getByRole("row");
      await expect(rows.filter({ hasText: "Systolic pressure" })).toContainText("7");
      await expect(
        overview.getByRole("columnheader", { name: text.rounds_overview_flags }),
      ).toHaveCount(0);
      await expect(rows.filter({ hasText: "Systolic pressure" })).not.toContainText(
        text.rounds_card_data_type,
      );
      await expect(rows.filter({ hasText: "Cuff size" })).toContainText("5");
      await expect(rows.filter({ hasText: "Body position" })).toContainText("3");
      await expectAxeClean(rater);
      await rater.screenshot({ path: test.info().outputPath(`overview-${locale}.png`) });
      await overview.getByRole("link", { name: "Cuff size" }).click();
      await expect(heading("Cuff size")).toBeFocused();
      await rater.context().close();

      // The facilitator's round page shows the progress, and no flagged details.
      const facilitator = await pageFor(browser, locale, project.facilitator.email);
      await facilitator.goto(`/projects/${projectId}/rounds/${roundId}`);
      await expect(
        facilitator.getByRole("heading", {
          level: 2,
          name: fill(text.rounds_round_name, { number: 1 }),
        }),
      ).toBeVisible();
      await expect(
        facilitator.getByRole("region", { name: fill(text.rounds_flags_heading, { count: 1 }) }),
      ).toHaveCount(0);
      await expect(facilitator.getByText("A blood pressure is a quantity in mmHg")).toHaveCount(0);
      await expectAxeClean(facilitator);
      await facilitator.context().close();
    });

    test("round 2 shows the own earlier score and the reasons, and rates with the keys", async ({
      db,
      browser,
    }) => {
      test.setTimeout(120_000);
      const seeded = await seedRoundTwo(db);
      const rater = await pageFor(browser, locale, seeded.nurse);
      await rater.goto(`/projects/${seeded.projectId}/rounds/${seeded.round2}/rate`);
      const card = (name: string) => rater.getByRole("region", { name });
      const heading = (name: string) => rater.getByRole("heading", { level: 3, name });
      const next = rater.getByRole("link", { name: text.rounds_card_next });
      const previous = rater.getByRole("link", { name: text.rounds_card_previous });

      // The whole card fits the first screen, with the way to the next card.
      const first = card("Systolic pressure");
      const seven = first.getByRole("radio", { name: "7", exact: true });
      await expectHydrated(seven);
      await rater.screenshot({ path: test.info().outputPath(`round2-${locale}.png`) });
      expect(await bottomOf(rater, first)).toBeLessThanOrEqual(SCREEN.height);
      expect(await bottomOf(rater, next)).toBeLessThanOrEqual(SCREEN.height);

      // The own score of round 1 is marked on the distribution and above its button (DE15). The
      // distribution opens below the own score (ADR 0019).
      await first
        .getByRole("button", { name: fill(text.rounds_rate_group_scores, { number: 1 }) })
        .click();
      const counts = [
        { score: 5, count: 1 },
        { score: 6, count: 1 },
        { score: 8, count: 1 },
        { score: 9, count: 1 },
      ]
        .map((row) => fill(text.rounds_result_mini_item, row))
        .join(", ");
      await expect(
        first.getByRole("img", {
          name: `${fill(text.rounds_result_mini_label, { counts })}. ${fill(text.rounds_result_mini_yours, { score: 6 })}`,
          exact: true,
        }),
      ).toBeVisible();
      const marker = first.locator("[data-previous-marker]");
      await expect(marker).toBeVisible();
      await expect(marker).toHaveText(
        `${fill(text.rounds_rate_previous_marker, { number: 1, score: 6 })} ▾`,
      );
      const markerBox = await marker.boundingBox();
      const sixBox = await first.getByRole("radio", { name: "6", exact: true }).boundingBox();
      if (!markerBox || !sixBox) throw new Error("marker or button has no box");
      expect(markerBox.y + markerBox.height).toBeLessThanOrEqual(sixBox.y + 1);
      const middle = markerBox.x + markerBox.width / 2;
      expect(middle).toBeGreaterThan(sixBox.x);
      expect(middle).toBeLessThan(sixBox.x + sixBox.width);
      for (const band of [
        text.rounds_rate_band_bottom,
        text.rounds_rate_band_middle,
        text.rounds_rate_band_top,
      ]) {
        await expect(first.getByText(band, { exact: true })).toBeVisible();
      }

      // The first three reasons of round 1 show on the card, the fourth after "Show all" (DE8).
      const reasons = first.getByRole("list", { name: text.rounds_rate_previous_reasons });
      await expect(reasons.getByRole("listitem")).toHaveText(REASONS.slice(0, 3));
      await expectAxeClean(rater);
      await first
        .getByRole("button", { name: fill(text.rounds_rate_reasons_all, { count: 4 }) })
        .click();
      await expect(reasons.getByRole("listitem")).toHaveText(REASONS);
      await expect(
        first.getByRole("button", { name: text.rounds_rate_reasons_fewer }),
      ).toHaveAttribute("aria-expanded", "true");
      await expectAxeClean(rater);
      await rater.screenshot({
        path: test.info().outputPath(`round2-all-reasons-${locale}.png`),
        fullPage: true,
      });

      // A digit chooses that score, and the save says which.
      await heading("Systolic pressure").focus();
      await rater.keyboard.press("7");
      await expect(seven).toBeChecked();
      await expect(first.getByRole("status").first()).toHaveText(
        fill(text.rounds_rate_saved_score, { score: 7 }),
      );

      // While the reason has focus the keys type; they do not choose or move.
      const reason = first.getByLabel(text.rounds_rate_reason_label);
      await reason.pressSequentially("N 8");
      await expect(reason).toHaveValue("N 8");
      await expect(seven).toBeChecked();
      await expect(heading("Systolic pressure")).toBeVisible();

      // N moves to the next card, U answers "unable to rate" there.
      await heading("Systolic pressure").click();
      await rater.keyboard.press("n");
      await expect(heading("Cuff size")).toBeFocused();
      await expect(rater).toHaveURL((url) => url.searchParams.get("card") === "2");
      await rater.keyboard.press("u");
      await expect(
        card("Cuff size").getByRole("radio", { name: text.rounds_rate_unable }),
      ).toBeChecked();
      await expect(card("Cuff size").getByRole("status").first()).toHaveText(
        text.rounds_rate_saved_unable,
      );
      await expect(card("Cuff size")).toContainText(
        fill(text.rounds_card_position, { index: 2, total: 2 }),
      );

      // Previous goes back to card 1; the reason saved when the field lost focus.
      await previous.click();
      await expect(heading("Systolic pressure")).toBeFocused();
      await expect(first.getByLabel(text.rounds_rate_reason_label)).toHaveValue("N 8");
      await expect(rater).toHaveURL((url) => url.searchParams.get("card") === "1");

      // The first card has no previous one, so P keeps it.
      await rater.keyboard.press("p");
      await expect(heading("Systolic pressure")).toBeFocused();

      // Dark mode keeps AA contrast on the card.
      await rater.emulateMedia({ colorScheme: "dark" });
      await expect(rater.locator("html")).toHaveAttribute("data-theme", "dark");
      await expectAxeClean(rater);
      await rater.screenshot({ path: test.info().outputPath(`round2-dark-${locale}.png`) });
      await rater.context().close();
    });
  });
}

test("the keys line shows with a mouse and a keyboard, not on a touch screen (DE18)", async ({
  db,
  browser,
}) => {
  const project = await seedProject(db, "decide");
  const participant = await seedParticipant(db, project);
  await insertElement(db, project.projectId, "Systolic pressure");
  const roundId = await openedRound(
    db,
    project.facilitator.userId,
    project.projectId,
    {},
    "An invented test panel",
  );
  const ratePath = `/projects/${project.projectId}/rounds/${roundId}/rate`;
  for (const [device, shown] of [
    [{}, true],
    [{ hasTouch: true, isMobile: true, viewport: { width: 412, height: 915 } }, false],
  ] as const) {
    const rater = await pageFor(browser, "en", participant, device);
    await rater.goto(ratePath);
    await expectHydrated(rater.getByRole("radio", { name: "7", exact: true }));
    const keys = rater.getByText(/^Keys:/);
    if (shown) await expect(keys).toBeVisible();
    else await expect(keys).toBeHidden();
    await expectAxeClean(rater);
    await rater.context().close();
  }
});
