// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The structure step of the detail phase in English and Dutch (DT1, DT2, ADR 0017): an architect
// proposes the structure of an element in the model, a participant objects from their "Your
// turn", and the facilitator addresses the objection and settles the proposal, which puts the
// structure on the element. Every page is axe-clean in both themes (Q-ACC-1, Q-I18N-1).
import type { Page } from "@playwright/test";
import {
  closedRoundWithOutcomes,
  emailOf,
  insertElement,
  joinedParticipant,
} from "../../src/server/test-fixtures.ts";
import { signInTo } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeCleanInBothThemes,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedParticipant,
  seedProject,
  test,
  uniqueName,
} from "./fixtures.ts";

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** The card of one element on the detail page, by its heading. */
function card(page: Page, name: string) {
  return page.getByRole("listitem").filter({ has: page.getByRole("heading", { name }) });
}

async function switchUser(page: Page, email: string, locale: Locale, path: string) {
  await page.context().clearCookies();
  await signInTo(page, email, locale, path);
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`the detail phase in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("an architect proposes, a participant objects, the facilitator settles", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "detail");
      const participant = await seedParticipant(db, project);
      const architect = emailOf(
        await joinedParticipant(
          db,
          project.facilitator.userId,
          project.projectId,
          "Architecture",
          uniqueName("architect"),
        ),
      );
      const systolic = await insertElement(db, project.projectId, "Systolic");
      const cuff = await insertElement(db, project.projectId, "Cuff size");
      await closedRoundWithOutcomes(db, project.projectId, [
        [systolic, "included"],
        [cuff, "excluded"],
      ]);
      const detailsUrl = `/projects/${project.projectId}/details`;

      // The architect proposes a quantity, exactly one, for the element in the model.
      await signInTo(page, architect, locale, detailsUrl);
      await expect(page.getByRole("heading", { level: 2, name: text.details_title })).toBeVisible();
      await expect(page.getByRole("heading", { level: 3, name: "Cuff size" })).toHaveCount(0);
      const systolicCard = card(page, "Systolic");
      await expect(systolicCard).toContainText(text.details_no_proposal);
      await expectAxeCleanInBothThemes(page);
      const proposeButton = systolicCard.getByRole("button", { name: text.details_propose });
      await expectHydrated(proposeButton);
      await proposeButton.click();
      const dialog = page.getByRole("dialog", {
        name: fill(text.details_propose_title, { name: "Systolic" }),
      });
      await dialog.getByRole("radio", { name: new RegExp(text.board_type_quantity_name) }).check();
      await dialog.getByLabel(text.board_min_label).selectOption("1");
      await dialog.getByLabel(text.board_max_label).selectOption("1");
      await expectAxeCleanInBothThemes(page);
      await dialog.getByRole("button", { name: text.details_propose_submit }).click();
      await expect(dialog).toHaveCount(0);
      await expect(systolicCard).toContainText(fill(text.details_by_architecture, { version: 1 }));
      await expect(systolicCard).toContainText("1..1");

      // The participant's home asks them to answer; they object with a reason.
      await switchUser(page, participant, locale, `/projects/${project.projectId}`);
      await expect(
        page.getByRole("heading", { level: 2, name: text.projects_home_turn_detail }),
      ).toBeVisible();
      await page.getByRole("link", { name: text.projects_task_detail_action }).click();
      await expect(page).toHaveURL((url) => url.pathname === detailsUrl);
      const object = card(page, "Systolic").getByRole("button", {
        name: new RegExp(`^${text.details_object}`),
      });
      await expectHydrated(object);
      await object.click();
      await card(page, "Systolic")
        .getByLabel(text.details_objection_label)
        .fill("A blood pressure needs its unit, mm[Hg].");
      await card(page, "Systolic")
        .getByRole("button", { name: text.details_objection_submit })
        .click();
      await expect(card(page, "Systolic")).toContainText(text.details_own_objected);
      await expect(card(page, "Systolic")).not.toContainText(text.details_address);
      await expectAxeCleanInBothThemes(page);

      // The facilitator reads the objection without a name, addresses it and settles.
      await switchUser(page, project.facilitator.email, locale, detailsUrl);
      await expect(
        page
          .getByRole("navigation", { name: text.projects_tabs_label })
          .getByRole("link", { name: text.projects_tab_details }),
      ).toHaveAttribute("aria-current", "page");
      const facilitatorCard = card(page, "Systolic");
      await expect(facilitatorCard).toContainText("A blood pressure needs its unit, mm[Hg].");
      await expect(facilitatorCard).not.toContainText(participant);
      const address = facilitatorCard.getByRole("button", { name: text.details_address });
      await expectHydrated(address);
      await address.click();
      await facilitatorCard
        .getByLabel(text.details_address_label)
        .fill("The unit belongs to the quantity type; terminology adds it.");
      await facilitatorCard.getByRole("button", { name: text.details_address_submit }).click();
      await expect(facilitatorCard).toContainText(text.details_addressed);
      await expectAxeCleanInBothThemes(page);
      await facilitatorCard.getByRole("button", { name: new RegExp(text.details_settle) }).click();
      await expect(facilitatorCard).toContainText(text.details_status_settled);
      await expect
        .poll(async () => {
          const row = await db
            .selectFrom("element")
            .select(["data_type", "min_occurs", "max_occurs"])
            .where("id", "=", systolic)
            .executeTakeFirstOrThrow();
          return row;
        })
        .toEqual({ data_type: "quantity", min_occurs: 1, max_occurs: 1 });
      await expectAxeCleanInBothThemes(page);
    });
  });
}
