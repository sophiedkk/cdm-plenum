// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A value round in the browser, in English and Dutch (DT3, DE1 to DE5, Q-ACC-1, Q-I18N-1): the
// facilitator puts the value lists of two elements into one round from the Details page and
// opens it, a participant rates the values from "Your turn", and after the closing date the
// facilitator closes the round and applies the kept values, which makes a new version of the
// proposal on the Details page.
import type { Page } from "@playwright/test";
import { type Kysely, sql } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { proposeDetail } from "../../src/server/details/queries.ts";
import { closedRoundWithOutcomes, insertElement } from "../../src/server/test-fixtures.ts";
import { signInTo } from "./board-seed.ts";
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
} from "./fixtures.ts";

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** The card of one element on the detail page, by its heading. */
function card(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
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
  test.describe(`value rounds in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("a value round from the Details page to a new version of the proposal", async ({
      page,
      db,
    }) => {
      test.setTimeout(150_000);
      const project = await seedProject(db, "detail");
      const participant = await seedParticipant(db, project);
      const severity = await insertElement(db, project.projectId, "Severity");
      const site = await insertElement(db, project.projectId, "Measurement site");
      await closedRoundWithOutcomes(db, project.projectId, [
        [severity, "included"],
        [site, "included"],
      ]);
      const propose = async (elementId: string, texts: string[]) => {
        const result = await proposeDetail(db, project.facilitator.userId, {
          projectId: project.projectId,
          elementId,
          version: 0,
          dataType: "coded_text",
          cardinality: { min: 0, max: 1 },
          values: texts.map((value) => ({ text: value, value: null })),
        });
        if (!result.ok) throw new Error(result.error);
      };
      await propose(severity, ["Mild", "Moderate", "Severe"]);
      await propose(site, ["Left arm", "Right arm"]);
      const detailsUrl = `/projects/${project.projectId}/details`;

      // The facilitator puts both lists into one draft round from their cards.
      await signInTo(page, project.facilitator.email, locale, detailsUrl);
      const start = card(page, "Severity").getByRole("button", {
        name: new RegExp(`^${text.details_value_round_start}`),
      });
      await expectHydrated(start);
      await start.click();
      await expect(
        card(page, "Severity").getByRole("link", {
          name: fill(text.details_value_round_draft, { number: 2 }),
        }),
      ).toBeVisible();
      const add = card(page, "Measurement site").getByRole("button", {
        name: new RegExp(`^${fill(text.details_value_round_add, { number: 2 })}`),
      });
      await expectHydrated(add);
      await add.click();
      const draftLink = card(page, "Measurement site").getByRole("link", {
        name: fill(text.details_value_round_draft, { number: 2 }),
      });
      await expect(draftLink).toBeVisible();
      await expectAxeClean(page);

      // The round page lists both lists; the facilitator opens it below the minimum.
      await draftLink.click();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: fill(text.rounds_value_round_name, { number: 2 }),
          exact: true,
        }),
      ).toBeVisible();
      const lists = page.getByRole("region", { name: text.rounds_value_lists_heading });
      await expect(lists).toContainText("Severity");
      await expect(lists).toContainText("Measurement site");
      await expectAxeClean(page);
      const roundId = page.url().split("/").at(-1) ?? "";
      const openButton = page.getByRole("button", { name: text.rounds_open_button });
      await expectHydrated(openButton);
      await openButton.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: text.rounds_open_confirm }).click();
      const reason = dialog.getByLabel(text.rounds_open_reason_label);
      await reason.fill("A teaching group of one");
      await dialog.getByRole("button", { name: text.rounds_open_with_reason }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(text.rounds_status_open, { exact: true }).first()).toBeVisible();

      // The participant rates from "Your turn": Moderate is left out, the others kept.
      await page.context().clearCookies();
      await signInTo(page, participant, locale, `/projects/${project.projectId}`);
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: fill(text.projects_home_turn_rate_values, { number: 2 }),
        }),
      ).toBeVisible();
      await expectAxeClean(page);
      await page.getByRole("link", { name: text.projects_home_rate_start }).click();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: fill(text.rounds_value_rate_title, { number: 2 }),
        }),
      ).toBeVisible();
      const scores = new Map([
        ["Mild", 9],
        ["Moderate", 1],
        ["Severe", 9],
        ["Left arm", 9],
        ["Right arm", 9],
      ]);
      // The cards come element by element in the board's order, which the test does not fix.
      for (let index = 0; index < scores.size; index++) {
        const region = page.getByRole("region").filter({ has: page.getByRole("radiogroup") });
        // Wait for this card's position first, so the heading read below is not the last card's.
        await expect(region).toContainText(
          fill(text.rounds_value_card_position, { index: index + 1, total: 5 }),
        );
        const heading = region.getByRole("heading", { level: 3 });
        await expect(heading).toBeVisible();
        const value = (await heading.textContent()) ?? "";
        const score = scores.get(value) ?? 0;
        expect(score).toBeGreaterThan(0);
        const option = region.getByRole("radio", {
          name:
            score === 1
              ? fill(text.rounds_rate_score_lowest, { score })
              : fill(text.rounds_rate_score_highest, { score }),
        });
        await expectHydrated(option);
        await option.check();
        await expect(region.getByRole("status")).toContainText(
          fill(text.rounds_rate_saved_score, { score }),
        );
        if (index === 0) await expectAxeClean(page);
        await page.getByRole("link", { name: text.rounds_card_next }).click();
      }
      await expect(
        page.getByRole("heading", { level: 3, name: text.rounds_overview_heading }),
      ).toBeVisible();
      await expect(
        page.getByRole("columnheader", { name: text.rounds_value_overview_item }),
      ).toBeVisible();
      await expectAxeClean(page);

      // After the closing date the facilitator closes the round and applies the Severity list.
      await page.context().clearCookies();
      const roundUrl = `/projects/${project.projectId}/rounds/${roundId}`;
      await signInTo(page, project.facilitator.email, locale, roundUrl);
      await passClosingDate(db, roundId);
      await page.reload();
      const close = page.getByRole("button", { name: text.rounds_close_button });
      await expectHydrated(close);
      await close.click();
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: text.rounds_close_confirm })
        .click();
      const results = page.getByRole("region", { name: text.rounds_results_heading });
      await expect(results.getByRole("row").filter({ hasText: "Mild" })).toContainText(
        text.rounds_value_outcome_included,
      );
      await expect(results.getByRole("row").filter({ hasText: "Moderate" })).toContainText(
        text.rounds_value_outcome_excluded,
      );
      await expectAxeClean(page);
      const apply = page.getByRole("button", {
        name: `${text.rounds_value_list_apply}: Severity`,
      });
      await expectHydrated(apply);
      await apply.click();
      await expect(
        page.getByText(fill(text.rounds_value_list_applied, { version: 2 })),
      ).toBeVisible();
      await expect(page.getByText(text.rounds_value_list_unchanged)).toBeVisible();
      await expectAxeClean(page);

      // The Details page shows the new version and links back to the round.
      await page.goto(detailsUrl);
      const severityCard = card(page, "Severity");
      await expect(
        severityCard.getByRole("link", {
          name: fill(text.details_value_round_applied, { version: 2, number: 2 }),
        }),
      ).toBeVisible();
      await expect(severityCard).toContainText("Mild");
      await expect(severityCard).not.toContainText("Moderate");
      await expectAxeClean(page);
    });
  });
}
