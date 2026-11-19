// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The members page (PR3, PR5, PR6): accessible in both languages and with the keyboard only
// (Q-ACC-1, Q-I18N-1); the facilitator invites and copies the link, the invitee joins with it;
// a participant sees the number of participants per group and no names (Q-ANON-1), and leaves.
import type { Page } from "@playwright/test";
import {
  addressOf,
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  type SeededProject,
  seedParticipant,
  seedProject,
  signIn,
  test,
  uniqueName,
} from "./fixtures.ts";
import { tabTo } from "./keyboard.ts";

/**
 * The group a seeded participant joins: the first by name. The seed creates the project in
 * English, so the group names stay English in both locales (tests/e2e/fixtures.ts).
 */
const FIRST_GROUP = "Administrative";

/** The row of a stakeholder group in the groups table, found by its row header. */
function groupRow(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
}

function membersUrl(project: SeededProject): string {
  return `/projects/${project.projectId}/members`;
}

/** Fills the invite form with the keyboard only and submits it. */
async function inviteWithKeyboard(page: Page, locale: Locale, email: string): Promise<void> {
  const text = MESSAGES[locale];
  const field = page.getByLabel(text.members_invite_email_label, { exact: true });
  await expectHydrated(field);
  await tabTo(page, field, 60);
  await page.keyboard.type(email);
  const group = page.getByLabel(text.members_invite_group_label, { exact: true });
  await tabTo(page, group);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("listbox")).toBeHidden();
  await tabTo(page, page.getByRole("button", { name: text.members_invite_submit, exact: true }));
  await page.keyboard.press("Enter");
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`members page in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("the facilitator's page is axe-clean and invites with the keyboard only", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      await signIn(page, project.facilitator.email, locale);
      await page.goto(membersUrl(project));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 2, name: text.members_title })).toBeVisible();
      await expect(page.getByRole("heading", { name: text.members_groups_title })).toBeVisible();
      await expectAxeClean(page);

      const email = addressOf(uniqueName("invitee"));
      await inviteWithKeyboard(page, locale, email);
      const row = page.getByRole("row").filter({ hasText: email });
      await expect(row).toBeVisible();
      await expect(row.getByText(text.members_invitation_status_pending)).toBeVisible();
      await expectAxeClean(page);

      // An empty group name is refused in the form, with the focus on the field.
      await page.getByRole("button", { name: text.members_new_group_submit }).click();
      await expect(page.getByText(text.members_group_name_required)).toBeVisible();
      await expect(page.getByLabel(text.members_group_name_label, { exact: true })).toBeFocused();
      await expectAxeClean(page);
    });

    test("a participant sees the number per group, no names, and the page is axe-clean", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      const participant = await seedParticipant(db, project);
      const other = await seedParticipant(db, project);
      await signIn(page, participant, locale);
      await page.goto(membersUrl(project));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const row = groupRow(page, FIRST_GROUP);
      await expect(row.getByRole("cell").last()).toHaveText("2");
      await expect(page.getByText(other)).toHaveCount(0);
      await expect(page.getByText(participant)).toHaveCount(1); // the app shell's own name
      await expect(
        page.getByRole("button", { name: text.members_invite_submit, exact: true }),
      ).toHaveCount(0);
      await expectAxeClean(page);

      const leave = page.getByRole("button", { name: text.members_leave, exact: true });
      await expectHydrated(leave);
      await tabTo(page, leave, 40);
      await page.keyboard.press("Enter");
      await expect(page.getByRole("alertdialog")).toBeVisible();
      await expectAxeClean(page);
      await page.keyboard.press("Escape");
      await expect(page.getByRole("alertdialog")).toBeHidden();
    });
  });
}

test("the facilitator invites, copies the link, and the invitee joins with it", async ({
  page,
  context,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await signIn(page, project.facilitator.email);
  await page.goto(membersUrl(project));

  const email = addressOf(uniqueName("invitee"));
  await page.getByLabel(text.members_invite_email_label, { exact: true }).fill(email);
  await page.getByLabel(text.members_invite_group_label, { exact: true }).click();
  await page.getByRole("option", { name: /^Nursing/ }).click();
  await page.getByRole("button", { name: text.members_invite_submit, exact: true }).click();
  const row = page.getByRole("row").filter({ hasText: email });
  await expect(row).toBeVisible();

  await row.getByRole("button", { name: text.members_copy_link }).click();
  await expect(page.getByText(text.members_link_copied)).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/invite\/[0-9a-f-]{36}$/);

  await context.clearCookies();
  await page.goto(link);
  await expect(page.getByRole("heading", { level: 1, name: text.invite_title })).toBeVisible();
  await page.getByRole("link", { name: text.invite_sign_in }).click();
  await signIn(page, email);
  await page.goto(membersUrl(project));
  const nursing = groupRow(page, "Nursing");
  await expect(nursing.getByRole("cell").last()).toHaveText("1");

  await context.clearCookies();
  await signIn(page, project.facilitator.email);
  await page.goto(membersUrl(project));
  await expect(groupRow(page, "Nursing")).toContainText(email);
  await expect(
    page
      .getByRole("row")
      .filter({ hasText: email })
      .getByText(text.members_invitation_status_accepted),
  ).toBeVisible();
});

test("a participant leaves the project and loses access", async ({ page, db }) => {
  const text = MESSAGES.en;
  const project = await seedProject(db);
  const participant = await seedParticipant(db, project);
  await signIn(page, participant);
  await page.goto(membersUrl(project));
  await page.getByRole("button", { name: text.members_leave, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: text.members_leave_confirm, exact: true })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
  await expect(page.getByRole("heading", { name: text.projects_empty_title })).toBeVisible();
  await page.goto(membersUrl(project));
  await expect(
    page.getByRole("heading", { level: 1, name: text.projects_not_found_title }),
  ).toBeVisible();
});
