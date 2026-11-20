// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Rating card by card at 1280 by 800 pixels, in English and Dutch (DE1, DE17, DE18, Q-ACC-1,
// Q-USE-1): a participant rates three elements one card at a time, goes back a card and changes
// a score, keeps the card through a reload and the back button, flags a data type with a reason,
// and checks every rating on the overview. The facilitator sees the flag count and the reason on
// the round page, without the participant's name.
import { randomBytes } from "node:crypto";
import type { Browser, Locator, Page } from "@playwright/test";
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { insertElement } from "../../src/server/test-fixtures.ts";
import { expectAxeCleanAfterToasts } from "./axe.ts";
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
} from "./fixtures.ts";
import { appUrl } from "./run-env.ts";

const SCREEN = { width: 1280, height: 800 };

/** Fills a message's `{placeholders}`, as Paraglide does. */
function fill(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** A signed-in page for `email` at 1280 by 800, in a context with its own client address. */
async function pageFor(browser: Browser, locale: Locale, email: string): Promise<Page> {
  const [a, b, c] = randomBytes(3);
  const context = await browser.newContext({
    baseURL: appUrl(),
    locale: BROWSER_LOCALE[locale],
    viewport: SCREEN,
    extraHTTPHeaders: { "X-Forwarded-For": `10.${a}.${b}.${c}` },
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

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`rating cards in ${locale}`, () => {
    const text = MESSAGES[locale];

    test("a participant rates card by card, changes a score and flags a data type", async ({
      db,
      browser,
    }) => {
      test.setTimeout(120_000);
      const project = await seedProject(db);
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

      const rater = await pageFor(browser, locale, participant);
      await rater.goto(ratePath);
      const card = (name: string) => rater.getByRole("region", { name });
      const heading = (name: string) => rater.getByRole("heading", { level: 3, name });
      const next = rater.getByRole("link", { name: text.rounds_card_next });
      const previous = rater.getByRole("link", { name: text.rounds_card_previous });
      const saved = async (name: string) =>
        expect(card(name).getByRole("status").first()).toHaveText(text.rounds_rate_saved);

      // Card 1 of 3 fits the first screen, with its details folded and marked not rated.
      const first = card("Systolic pressure");
      await expect(first).toContainText(fill(text.rounds_card_position, { index: 1, total: 3 }));
      const seven = first.getByRole("radio", { name: "7", exact: true });
      await expectHydrated(seven);
      expect(await bottomOf(rater, first)).toBeLessThanOrEqual(SCREEN.height);
      expect(await bottomOf(rater, next)).toBeLessThanOrEqual(SCREEN.height);
      await expect(first.getByText(text.rounds_card_details_summary)).toBeVisible();
      await expect(first.getByText("DV_TEXT")).toBeHidden();
      await seven.click();
      await saved("Systolic pressure");
      // With "Remove my answer" shown after the choice, the card still fits.
      expect(await bottomOf(rater, next)).toBeLessThanOrEqual(SCREEN.height);
      await expectAxeClean(rater);
      await rater.screenshot({ path: test.info().outputPath(`card-${locale}.png`) });

      // The participant flags the data type with a reason (DE17).
      await first.getByText(text.rounds_card_details_summary).click();
      // The data type reads as on the board: its name first, the standards' types after it.
      await expect(
        first.getByText(`${text.board_type_text_name} (DV_TEXT / string)`),
      ).toBeVisible();
      await first
        .getByRole("button", {
          name: fill(text.rounds_flag_open_named, { detail: text.rounds_flag_detail_data_type }),
        })
        .click();
      const reason = first.getByLabel(text.rounds_flag_reason_data_type);
      await expect(reason).toBeFocused();
      await expectAxeClean(rater);
      await rater.screenshot({
        path: test.info().outputPath(`card-flag-form-${locale}.png`),
        fullPage: true,
      });
      await reason.fill("A blood pressure is a quantity in mmHg");
      await first.getByRole("button", { name: text.rounds_flag_save }).click();
      await expect(
        first.getByText(
          fill(text.rounds_flag_yours, { reason: "A blood pressure is a quantity in mmHg" }),
        ),
      ).toBeVisible();
      await expect(
        first.getByRole("button", {
          name: fill(text.rounds_flag_change_named, { detail: text.rounds_flag_detail_data_type }),
        }),
      ).toBeFocused();
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
      await saved("Cuff size");
      await next.click();
      await expect(heading("Body position")).toBeFocused();
      await card("Body position").getByRole("radio", { name: "3", exact: true }).click();
      await saved("Body position");

      // Back one card, and the score changes from 9 to 5.
      await previous.click();
      await expect(heading("Cuff size")).toBeFocused();
      await expect(
        card("Cuff size").getByRole("radio", {
          name: fill(text.rounds_rate_score_highest, { score: 9 }),
        }),
      ).toBeChecked();
      await card("Cuff size").getByRole("radio", { name: "5", exact: true }).click();
      await saved("Cuff size");

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
      await expect(
        rater.getByText(fill(text.rounds_rate_progress, { rated: 3, total: 3 })),
      ).toHaveCount(1);
      const rows = overview.getByRole("row");
      await expect(rows.filter({ hasText: "Systolic pressure" })).toContainText("7");
      await expect(rows.filter({ hasText: "Systolic pressure" })).toContainText(
        text.rounds_card_data_type,
      );
      await expect(rows.filter({ hasText: "Cuff size" })).toContainText("5");
      await expect(rows.filter({ hasText: "Body position" })).toContainText("3");
      await expectAxeClean(rater);
      await rater.screenshot({ path: test.info().outputPath(`overview-${locale}.png`) });
      await overview.getByRole("link", { name: "Cuff size" }).click();
      await expect(heading("Cuff size")).toBeFocused();
      await rater.context().close();

      // The facilitator sees the flag count and the reason, without the participant's name.
      const facilitator = await pageFor(browser, locale, project.facilitator.email);
      await facilitator.goto(`/projects/${projectId}/rounds/${roundId}`);
      const flags = facilitator.getByRole("region", {
        name: fill(text.rounds_flags_heading, { count: 1 }),
      });
      await expect(flags).toContainText("Systolic pressure");
      await expect(flags).toContainText(
        fill(text.rounds_flags_count, { detail: text.rounds_card_data_type, count: 1 }),
      );
      await expect(flags).toContainText("A blood pressure is a quantity in mmHg");
      await expect(flags).not.toContainText(participant);
      await expectAxeClean(facilitator);
      await flags.scrollIntoViewIfNeeded();
      await facilitator.screenshot({
        path: test.info().outputPath(`facilitator-flags-${locale}.png`),
        fullPage: true,
      });
      await facilitator.context().close();
    });
  });
}
