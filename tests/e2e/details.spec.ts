// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The detail phase in English and Dutch (DT1 to DT5, ADR 0017). Structure: an architect proposes
// the structure of an element in the model, a participant objects from their "Your turn", and the
// facilitator addresses the objection and settles. Codes: a terminologist proposes them, a second
// terminologist approves them, a participant agrees and the facilitator settles, which puts the
// codes on the element. Every page is axe-clean in both themes (Q-ACC-1, Q-I18N-1).
import type { Page } from "@playwright/test";
import { proposeDetail, settleDetail } from "../../src/server/details/queries.ts";
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
      // The task bar counts what the architect still proposes: the structure and the tree (P1).
      const architectBar = page.getByTestId("task-bar");
      await expect(architectBar).toContainText(text.projects_bar_detail);
      await expect(architectBar.getByRole("status")).toHaveText(
        fill(text.projects_bar_to_propose, { count: 2 }),
      );
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
      // The units field opens for a quantity; the first unit is the preferred one.
      await dialog.getByLabel(text.details_units_label).fill("mm[Hg] kPa");
      await expectAxeCleanInBothThemes(page);
      await dialog.getByRole("button", { name: text.details_propose_submit }).click();
      await expect(dialog).toHaveCount(0);
      await expect(systolicCard).toContainText(fill(text.details_by_architecture, { version: 1 }));
      await expect(systolicCard).toContainText("1..1");
      await expect(systolicCard).toContainText("mm[Hg]; kPa");
      await expect(architectBar.getByRole("status")).toHaveText(
        [
          fill(text.projects_bar_answered, { done: 0, total: 1 }),
          fill(text.projects_bar_to_propose, { count: 1 }),
        ].join(""),
      );

      // The participant's home asks them to answer; they object with a reason.
      await switchUser(page, participant, locale, `/projects/${project.projectId}`);
      await expect(
        page.getByRole("heading", { level: 2, name: text.projects_home_turn_detail }),
      ).toBeVisible();
      await page.getByRole("link", { name: text.projects_task_detail_action }).click();
      await expect(page).toHaveURL((url) => url.pathname === detailsUrl);
      const bar = page.getByTestId("task-bar");
      await expect(bar.getByRole("status")).toHaveText(
        fill(text.projects_bar_answered, { done: 0, total: 1 }),
      );
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
      // Nothing is left: the bar is the done state, and the proposal stays open to change.
      await expect(bar.getByRole("heading", { name: text.projects_bar_done_title })).toBeVisible();
      await expect(bar.getByText(text.projects_bar_detail_done)).toBeVisible();
      await expect(bar.getByRole("link", { name: text.projects_bar_back })).toBeVisible();
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
      // The facilitator settles and has no task bar.
      await expect(page.getByTestId("task-bar")).toHaveCount(0);
      await expectAxeCleanInBothThemes(page);
      await facilitatorCard.getByRole("button", { name: new RegExp(text.details_settle) }).click();
      await expect(facilitatorCard).toContainText(text.details_status_settled);
      await expect
        .poll(async () => {
          const row = await db
            .selectFrom("element")
            .select(["data_type", "min_occurs", "max_occurs", "units"])
            .where("id", "=", systolic)
            .executeTakeFirstOrThrow();
          return row;
        })
        .toEqual({
          data_type: "quantity",
          min_occurs: 1,
          max_occurs: 1,
          units: ["mm[Hg]", "kPa"],
        });
      await expectAxeCleanInBothThemes(page);
    });

    test("a terminologist proposes codes, a second approves, the facilitator settles", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "detail");
      const participant = await seedParticipant(db, project);
      const terminologist = async (name: string) =>
        emailOf(
          await joinedParticipant(
            db,
            project.facilitator.userId,
            project.projectId,
            "Terminology",
            uniqueName(name),
          ),
        );
      const proposer = await terminologist("terminologist");
      const reviewer = await terminologist("reviewer");
      const site = await insertElement(db, project.projectId, "Measurement site");
      await closedRoundWithOutcomes(db, project.projectId, [[site, "included"]]);
      const structure = await proposeDetail(db, project.facilitator.userId, {
        projectId: project.projectId,
        elementId: site,
        version: 0,
        dataType: "coded_text",
        cardinality: { min: 0, max: 1 },
        units: [],
        values: [
          { text: "Left arm", value: null },
          { text: "Right arm", value: null },
        ],
      });
      if (!structure.ok) throw new Error(structure.error);
      const settled = await settleDetail(db, project.facilitator.userId, {
        projectId: project.projectId,
        ...structure.value,
      });
      if (!settled.ok) throw new Error(settled.error);
      const detailsUrl = `/projects/${project.projectId}/details`;
      const codesOf = fill(text.details_codes_of, { name: "Measurement site" });

      // The first terminologist proposes the codes.
      await signInTo(page, proposer, locale, detailsUrl);
      // The bar counts the codes still to propose for the element with a settled structure (P1).
      await expect(page.getByTestId("task-bar").getByRole("status")).toHaveText(
        fill(text.projects_bar_to_propose_codes, { count: 1 }),
      );
      const proposeButton = card(page, "Measurement site").getByRole("button", {
        name: new RegExp(`^${text.details_propose_codes}`),
      });
      await expectHydrated(proposeButton);
      await proposeButton.click();
      const dialog = page.getByRole("dialog", {
        name: fill(text.details_codes_title, { name: "Measurement site" }),
      });
      const elementCode = dialog.getByRole("group", { name: text.details_element_code });
      await elementCode.getByLabel(text.details_code_system).selectOption("snomed");
      await elementCode.getByLabel(text.details_code, { exact: true }).fill("246153002");
      await dialog.getByLabel(text.details_binding).selectOption("extensible");
      const left = dialog.getByRole("group", {
        name: fill(text.details_value_code_legend, { value: "Left arm" }),
      });
      await left.getByLabel(text.details_code_system).selectOption("snomed");
      await left.getByLabel(text.details_code, { exact: true }).fill("368208006");
      await expectAxeCleanInBothThemes(page);
      await dialog.getByRole("button", { name: text.details_propose_submit }).click();
      await expect(dialog).toHaveCount(0);
      await expect(card(page, "Measurement site")).toContainText(text.details_review_pending);

      // A participant sees only that codes wait for review.
      await switchUser(page, participant, locale, detailsUrl);
      await expect(card(page, "Measurement site")).toContainText(text.details_codes_in_review);
      await expect(card(page, "Measurement site")).not.toContainText("368208006");
      await expectAxeCleanInBothThemes(page);

      // The second terminologist approves.
      await switchUser(page, reviewer, locale, detailsUrl);
      await expect(page.getByTestId("task-bar").getByRole("status")).toHaveText(
        fill(text.projects_bar_to_review, { count: 1 }),
      );
      const approve = card(page, "Measurement site").getByRole("button", {
        name: new RegExp(`^${text.details_review_approve}`),
      });
      await expectHydrated(approve);
      await approve.click();
      await expect(card(page, "Measurement site")).toContainText(text.details_review_approved);

      // The participant agrees with the codes.
      await switchUser(page, participant, locale, detailsUrl);
      const agree = card(page, "Measurement site").getByRole("button", {
        name: new RegExp(`^${text.details_agree}\\s*: ${codesOf}$`),
      });
      await expectHydrated(agree);
      await agree.click();
      await expect(card(page, "Measurement site")).toContainText(text.details_own_agreed);

      // The facilitator settles; the codes go onto the element.
      await switchUser(page, project.facilitator.email, locale, detailsUrl);
      const settle = card(page, "Measurement site").getByRole("button", {
        name: new RegExp(`^${text.details_settle}\\s*: ${codesOf}$`),
      });
      await expectHydrated(settle);
      await settle.click();
      await expect
        .poll(async () =>
          db
            .selectFrom("element")
            .select(["code", "binding_strength"])
            .where("id", "=", site)
            .executeTakeFirstOrThrow(),
        )
        .toEqual({ code: "246153002", binding_strength: "extensible" });
      await expectAxeCleanInBothThemes(page);
    });
  });
}
