// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A full Delphi round in the browser, in English and Dutch (DE1 to DE6, DE12, Q-ACC-1,
// Q-I18N-1): the facilitator sets up a round and opens it below the minimum with a reason, two
// participants rate (one "unable to rate"), and after the closing date the facilitator closes
// the round and the results show the outcome. A facilitator rates after joining a stakeholder
// group on the members page (DE14).
import { randomBytes } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { type Kysely, sql } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { insertElement } from "../../src/server/test-fixtures.ts";
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
import { tabTo } from "./keyboard.ts";
import { appUrl } from "./run-env.ts";

/**
 * Waits until every toast has finished its entry animation, so axe measures the contrast of the
 * toast as it is read, then runs the axe check.
 */
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

/** Signs in with the e-mail link in `locale` and waits for the projects page. */
async function signInAs(page: Page, email: string, locale: Locale): Promise<void> {
  await page.goto(await requestSignInLink(page, email, locale));
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
}

/** Fills a message's `{placeholders}`, as Paraglide does. */
function fill(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** The value of a `datetime-local` input one day from now, in the browser's (local) zone. */
function tomorrowInput(): string {
  const date = new Date(Date.now() + 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T17:00`;
}

/** A signed-in page for `email` in a context of its own, with its own client address. */
async function pageFor(browser: Browser, locale: Locale, email: string): Promise<Page> {
  const [a, b, c] = randomBytes(3);
  const context = await browser.newContext({
    baseURL: appUrl(),
    locale: BROWSER_LOCALE[locale],
    extraHTTPHeaders: { "X-Forwarded-For": `10.${a}.${b}.${c}` },
  });
  const page = await context.newPage();
  await signInAs(page, email, locale);
  return page;
}

/**
 * Moves the round's closing date into the past. The DE2 trigger refuses that change on an open
 * round, so this one transaction runs with triggers off, as only a test may.
 */
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

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`rounds in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("a round from setup to results", async ({ page, db, browser }) => {
      test.setTimeout(120_000);
      const project = await seedProject(db, "decide");
      await insertElement(db, project.projectId, "Systolic pressure");
      await insertElement(db, project.projectId, "Cuff size");
      const first = await seedParticipant(db, project);
      const second = await seedParticipant(db, project);
      const rounds = `/projects/${project.projectId}/rounds`;

      // The facilitator sees the panel below the minimum and sets up the round.
      await signInAs(page, project.facilitator.email, locale);
      await page.goto(rounds);
      await expect(
        page.getByRole("heading", { level: 2, name: text.rounds_title, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("heading", { name: text.rounds_panel_heading })).toBeVisible();
      await axeClean(page);

      const newRound = page.getByRole("link", { name: text.rounds_new }).first();
      await expectHydrated(newRound);
      await newRound.click();
      await expect(
        page.getByRole("heading", { level: 2, name: text.rounds_new_title, exact: true }),
      ).toBeVisible();
      const closesAt = page.getByLabel(text.rounds_closes_at_label);
      await expectHydrated(closesAt);
      await axeClean(page);
      await closesAt.fill(tomorrowInput());
      await page.getByRole("button", { name: text.rounds_create }).click();

      const roundName = fill(text.rounds_round_name, { number: 1 });
      await expect(
        page.getByRole("heading", { level: 2, name: roundName, exact: true }),
      ).toBeVisible();
      const roundUrl = page.url();
      const roundId = roundUrl.split("/").at(-1) ?? "";
      await axeClean(page);

      // Opening below the minimum asks for a reason (DE12).
      const openButton = page.getByRole("button", { name: text.rounds_open_button });
      await expectHydrated(openButton);
      await openButton.click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toContainText(text.rounds_open_fixed);
      await axeClean(page);
      await dialog.getByRole("button", { name: text.rounds_open_confirm }).click();
      const reason = dialog.getByLabel(text.rounds_open_reason_label);
      await expect(reason).toBeFocused();
      await expect(dialog).toContainText(text.rounds_open_below_minimum);
      await axeClean(page);
      await reason.fill("A teaching group of two");
      await dialog.getByRole("button", { name: text.rounds_open_with_reason }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(text.rounds_status_open, { exact: true }).first()).toBeVisible();
      // The panel at opening and the reason sit behind the setup disclosure.
      await page.getByText(text.rounds_setup_details).click();
      await expect(page.getByText("A teaching group of two")).toBeVisible();
      await axeClean(page);

      // The first participant rates with the keyboard only.
      const rater = await pageFor(browser, locale, first);
      await rater.goto(rounds);
      const rateNow = rater.getByRole("link", {
        name: fill(text.rounds_rate_now, { number: 1 }),
      });
      await expect(rateNow).toBeVisible();
      await axeClean(rater);
      await rateNow.click();
      await expect(rater.getByText(text.rounds_rate_hidden_title)).toBeVisible();
      await axeClean(rater);
      const systolic = rater.getByRole("group", { name: "Systolic pressure" });
      const lowest = systolic.getByRole("radio", {
        name: fill(text.rounds_rate_score_lowest, { score: 1 }),
      });
      await expectHydrated(lowest);
      await tabTo(rater, lowest, 30);
      // Arrow keys move through the scale and choose as they go. Radix moves the focus in a
      // timeout and chooses only while the key is down, so the key is held as a person does.
      for (let score = 2; score <= 8; score++) {
        await rater.keyboard.down("ArrowRight");
        await expect(systolic.getByRole("radio", { name: String(score) })).toBeChecked();
        await rater.keyboard.up("ArrowRight");
      }
      await expect(systolic.getByRole("status")).toHaveText(text.rounds_rate_saved);
      const cuff = rater.getByRole("group", { name: "Cuff size" });
      await cuff
        .getByRole("radio", { name: fill(text.rounds_rate_score_highest, { score: 9 }) })
        .click();
      await expect(cuff.getByRole("status")).toHaveText(text.rounds_rate_saved);
      await expect(
        rater.getByText(fill(text.rounds_rate_progress, { rated: 2, total: 2 })),
      ).toBeVisible();
      await axeClean(rater);

      // The second participant cannot rate one element.
      const other = await pageFor(browser, locale, second);
      await other.goto(`${rounds}/${roundId}/rate`);
      const otherSystolic = other.getByRole("group", { name: "Systolic pressure" });
      const unable = otherSystolic.getByRole("radio", { name: text.rounds_rate_unable });
      await expectHydrated(unable);
      await unable.click();
      await expect(otherSystolic.getByRole("status")).toHaveText(text.rounds_rate_saved);
      const otherCuff = other.getByRole("group", { name: "Cuff size" });
      await otherCuff.getByRole("radio", { name: "2" }).click();
      await expect(otherCuff.getByRole("status")).toHaveText(text.rounds_rate_saved);

      // The facilitator sees the response, then closes the round after its date.
      await page.reload();
      await expect(page.getByRole("heading", { name: text.rounds_progress_heading })).toBeVisible();
      await expect(page.getByText(text.rounds_close_not_due)).toBeVisible();
      await passClosingDate(db, roundId);
      await page.reload();
      await expect(page.getByText(text.rounds_status_awaiting_close).first()).toBeVisible();
      await axeClean(page);
      const close = page.getByRole("button", { name: text.rounds_close_button });
      await expectHydrated(close);
      await close.click();
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await axeClean(page);
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: text.rounds_close_confirm })
        .click();

      // Systolic: one score of 8, one unable to rate: included. Cuff size: 9 and 2: no consensus.
      const results = page.getByRole("region", { name: text.rounds_results_heading });
      await expect(results).toBeVisible();
      const systolicResult = results.getByRole("row").filter({ hasText: "Systolic pressure" });
      await expect(systolicResult).toContainText(text.rounds_outcome_included);
      const details = systolicResult.getByRole("button", {
        name: fill(text.rounds_result_details_for, { name: "Systolic pressure" }),
      });
      await expectHydrated(details);
      await details.click();
      await expect(
        results.getByRole("table", {
          name: fill(text.rounds_result_distribution, { name: "Systolic pressure" }),
        }),
      ).toBeVisible();
      await expect(results.getByRole("row").filter({ hasText: "Cuff size" })).toContainText(
        text.rounds_outcome_no_consensus,
      );
      await axeClean(page);

      // Participants see the results too (DE5).
      await rater.goto(roundUrl);
      await expect(rater.getByRole("region", { name: text.rounds_results_heading })).toContainText(
        text.rounds_outcome_included,
      );
      await axeClean(rater);
      await rater.context().close();
      await other.context().close();
    });

    test("the facilitator joins a stakeholder group and rates (DE14)", async ({ page, db }) => {
      const project = await seedProject(db, "decide");
      await insertElement(db, project.projectId, "Heart rate");
      await seedParticipant(db, project);
      await openedRound(db, project.facilitator.userId, project.projectId, {}, "A small panel");
      const rounds = `/projects/${project.projectId}/rounds`;
      const rateNow = fill(text.rounds_rate_now, { number: 1 });

      // Without a group the facilitator gets no rating link, and the page says where to join.
      await signInAs(page, project.facilitator.email, locale);
      await page.goto(rounds);
      await expect(page.getByText(text.rounds_rate_join_group)).toBeVisible();
      await expect(page.getByRole("link", { name: rateNow })).toHaveCount(0);
      await axeClean(page);
      await page.getByRole("link", { name: text.rounds_rate_members_link }).click();

      await expect(page.getByText(text.members_rater_none)).toBeVisible();
      const group = page.getByLabel(text.members_rater_group_label, { exact: true });
      await expectHydrated(group);
      await axeClean(page);
      await group.click();
      await page.getByRole("option", { name: /^Nursing/ }).click();
      await page.getByRole("button", { name: text.members_rater_join }).click();
      await expect(
        page.getByText(fill(text.members_rater_current, { group: "Nursing" })),
      ).toBeVisible();
      // A round is open, so the facilitator stays in this group until it closes.
      await expect(page.getByText(text.members_rater_locked)).toBeVisible();
      await axeClean(page);

      await page.goto(rounds);
      const link = page.getByRole("link", { name: rateNow });
      await expect(link).toBeVisible();
      await expectHydrated(link);
      await link.click();
      await expect(page.getByText(text.rounds_rate_hidden_title)).toBeVisible();
      const heartRate = page.getByRole("group", { name: "Heart rate" });
      const highest = heartRate.getByRole("radio", {
        name: fill(text.rounds_rate_score_highest, { score: 9 }),
      });
      await expectHydrated(highest);
      await highest.click();
      await expect(heartRate.getByRole("status")).toHaveText(text.rounds_rate_saved);
      await expect(
        page.getByText(fill(text.rounds_rate_progress, { rated: 1, total: 1 })),
      ).toBeVisible();
      await axeClean(page);

      const rating = await db
        .selectFrom("rating")
        .innerJoin("team", "team.id", "rating.team_id")
        .select(["rating.score", "team.name"])
        .where("team.organizationId", "=", project.projectId)
        .execute();
      expect(rating).toEqual([{ score: 9, name: "Nursing" }]);
    });
  });
}
