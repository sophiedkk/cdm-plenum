// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Round 1 asks whether each element belongs in the model and ends with the open question for
// missing elements on the overview after the last card (DE1, DE16, DE18), in English and Dutch (Q-ACC-1, Q-I18N-1): a participant sees the
// question and its anchors, proposes two elements and deletes one; the facilitator sees the
// proposal without its proposer, adds it to the board, and the board shows it with its source.
import { randomBytes } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
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

/** Fills a message's `{placeholders}`, as Paraglide does. */
function fill(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
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
  await page.goto(await requestSignInLink(page, email, locale));
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
  return page;
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`proposals in round 1 in ${locale}`, () => {
    const text = MESSAGES[locale];

    test("a participant proposes an element and the facilitator adds it to the board", async ({
      db,
      browser,
    }) => {
      test.setTimeout(90_000);
      const project = await seedProject(db);
      const { projectId } = project;
      const participant = await seedParticipant(db, project);
      await insertElement(db, projectId, "Systolic pressure");
      const roundId = await openedRound(
        db,
        project.facilitator.userId,
        projectId,
        { proposalRule: text.rounds_proposal_rule_default },
        "An invented test panel",
      );

      // The participant sees the data model question and its anchors (DE1).
      const rater = await pageFor(browser, locale, participant);
      await rater.goto(`/projects/${projectId}/rounds/${roundId}/rate`);
      await expect(rater.getByText(text.rounds_rate_question)).toBeVisible();
      await expect(
        rater.getByText(
          fill(text.rounds_rate_bands, { bottomFrom: 1, bottomTo: 3, topFrom: 7, topTo: 9 }),
          { exact: false },
        ),
      ).toBeVisible();
      const systolic = rater.getByRole("region", { name: "Systolic pressure" });
      await expect(
        systolic.getByRole("radio", { name: fill(text.rounds_rate_score_lowest, { score: 1 }) }),
      ).toBeVisible();
      await expect(
        systolic.getByRole("radio", { name: fill(text.rounds_rate_score_highest, { score: 9 }) }),
      ).toBeVisible();

      // The open question follows the overview after the last card, with the rule set before
      // the round opened (DE16).
      await expect(rater.getByRole("region", { name: text.rounds_propose_heading })).toHaveCount(0);
      const next = rater.getByRole("link", { name: text.rounds_card_next });
      await expectHydrated(next);
      await next.click();
      await expect(
        rater.getByRole("heading", { name: text.rounds_overview_heading }),
      ).toBeFocused();
      const propose = rater.getByRole("region", { name: text.rounds_propose_heading });
      await expect(propose).toContainText(
        fill(text.rounds_propose_rule, { rule: text.rounds_proposal_rule_default }),
      );
      await expectAxeClean(rater);
      const name = propose.getByLabel(text.rounds_propose_name_label);
      await expectHydrated(name);
      for (const [element, description] of [
        ["Body position", "Lying, sitting or standing"],
        ["Cuff location", ""],
      ] as const) {
        await name.fill(element);
        await propose.getByLabel(text.rounds_propose_description_label).fill(description);
        await propose.getByRole("button", { name: text.rounds_propose_submit }).click();
        await expect(propose.getByRole("listitem").filter({ hasText: element })).toBeVisible();
        await expect(name).toHaveValue("");
      }
      await expect(propose).toContainText(fill(text.rounds_propose_mine, { count: 2 }));
      await propose
        .getByRole("button", {
          name: fill(text.rounds_propose_delete_named, { name: "Cuff location" }),
        })
        .click();
      await expect(propose.getByRole("status")).toHaveText(text.rounds_propose_deleted);
      await expect(propose).toContainText(fill(text.rounds_propose_mine, { count: 1 }));
      await expect(propose).not.toContainText("Cuff location");
      await expectAxeClean(rater);
      await rater.context().close();

      // The facilitator sees the proposal without its proposer and adds it to the board.
      const facilitator = await pageFor(browser, locale, project.facilitator.email);
      await facilitator.goto(`/projects/${projectId}/rounds/${roundId}`);
      const list = facilitator.getByRole("region", {
        name: fill(text.rounds_proposals_heading, { count: 1 }),
      });
      await expect(list).toContainText("Body position");
      await expect(list).toContainText("Lying, sitting or standing");
      await expect(list).not.toContainText(participant);
      await expectAxeClean(facilitator);
      const add = list.getByRole("button", {
        name: fill(text.rounds_proposals_add_named, { name: "Body position" }),
      });
      await expectHydrated(add);
      await add.click();
      await expect(list).toContainText(text.rounds_proposals_on_board);
      await expect(add).toHaveCount(0);
      await expectAxeCleanAfterToasts(facilitator);

      // The board shows the element with its source.
      await facilitator.goto(`/projects/${projectId}/board`);
      const toggle = facilitator.getByRole("button", { name: "Body position", exact: true });
      await expectHydrated(toggle);
      await toggle.click();
      const details = facilitator.getByRole("region", {
        name: fill(text.board_details_label, { name: "Body position" }),
      });
      await expect(details).toContainText(fill(text.board_source_kind_delphi, { number: 1 }));
      await expect(details).toContainText("Lying, sitting or standing");
      await expectAxeClean(facilitator);
      await facilitator.context().close();
    });
  });
}
