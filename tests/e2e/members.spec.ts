// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The People tab and "About this project" (PR3, PR5 to PR7, PR12, ADR 0019): accessible in both
// languages and with the keyboard only (Q-ACC-1, Q-I18N-1); the facilitator sees the people per
// group, invites in a dialog and copies the link, the invitee joins with it; a participant sees
// the number of participants per group on the project home and no names (Q-ANON-1) until the
// facilitator turns the names on in Settings, never an address, and leaves.
import type { Page } from "@playwright/test";
import type { Kysely } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
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
  watchHydration,
} from "./fixtures.ts";
import { tabTo } from "./keyboard.ts";

/**
 * The group a seeded participant joins: the first by name. The seed creates the project in
 * English, so the group names stay English in both locales (tests/e2e/fixtures.ts).
 */
const FIRST_GROUP = "Administrative";

/** The facilitator's people of one group: the row group headed by the group's name. */
function groupPeople(page: Page, name: string) {
  return page
    .getByRole("rowgroup")
    .filter({ has: page.getByRole("rowheader", { name: new RegExp(`^${name}`) }) });
}

function membersUrl(project: SeededProject): string {
  return `/projects/${project.projectId}/members`;
}

function homeUrl(project: SeededProject): string {
  return `/projects/${project.projectId}`;
}

/** Opens "About this project" on the participant's home and returns its panel. */
async function openAbout(page: Page, project: SeededProject, locale: Locale) {
  const text = MESSAGES[locale];
  await page.goto(homeUrl(project));
  const about = page.getByRole("button", { name: text.projects_about_title });
  await expectHydrated(about);
  await about.click();
  return page.getByRole("region", { name: text.projects_about_title });
}

/** The people of one group in "About this project": the group's name and what follows it. */
function aboutGroup(panel: ReturnType<Page["getByRole"]>, name: string) {
  // The heading and the people of its group share one parent.
  return panel.getByRole("heading", { name, exact: true }).locator("xpath=..");
}

function settingsUrl(project: SeededProject): string {
  return `/projects/${project.projectId}/settings`;
}

/** Opens the invite dialog with the keyboard and returns it. */
async function openInviteDialog(page: Page, locale: Locale) {
  const text = MESSAGES[locale];
  const open = page.getByRole("button", { name: text.members_invite_title, exact: true });
  await expectHydrated(open);
  await tabTo(page, open, 60);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: text.members_invite_title });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** Waits until every toast has finished its entry animation, so axe measures it as it is read. */
async function toastsSettled(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page
        .locator("[data-sonner-toast]")
        .evaluateAll((toasts) => toasts.every((toast) => getComputedStyle(toast).opacity === "1")),
    )
    .toBe(true);
}

/** Fills a message's `{placeholders}`, as Paraglide does. */
function fill(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** Gives the account of `email` an invented name. */
async function nameAccount(db: Kysely<DB>, email: string, name: string): Promise<void> {
  await db.updateTable("user").set({ name }).where("email", "=", email).execute();
}

/** Fills the invite form in its dialog with the keyboard only and submits it. */
async function inviteWithKeyboard(page: Page, locale: Locale, email: string): Promise<void> {
  const text = MESSAGES[locale];
  const dialog = await openInviteDialog(page, locale);
  const field = dialog.getByLabel(text.members_invite_email_label, { exact: true });
  await expect(field).toBeFocused();
  await expectAxeClean(page);
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

    test("the facilitator's page shows people per group and invites with the keyboard only", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      const participant = await seedParticipant(db, project);
      const hydration = watchHydration(page);
      await signIn(page, project.facilitator.email, locale);
      await page.goto(membersUrl(project));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.getByRole("heading", { level: 2, name: text.members_title })).toBeVisible();
      await expect(page.getByRole("heading", { name: text.members_groups_title })).toBeVisible();
      // One table of people, a row group per stakeholder group (ADR 0018).
      await expect(groupPeople(page, FIRST_GROUP)).toContainText(participant);
      await expect(page.getByText(text.members_invitations_none_open)).toBeVisible();
      // The settings moved to their own page (PR12).
      await expect(page.getByRole("checkbox", { name: text.members_names_label })).toHaveCount(0);
      await expectAxeClean(page);

      const email = addressOf(uniqueName("invitee"));
      await inviteWithKeyboard(page, locale, email);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const row = page.getByRole("row").filter({ hasText: email });
      await expect(row).toBeVisible();
      await expect(row.getByText(text.members_invitation_status_pending)).toBeVisible();
      // The invitation's expiry is a time with a zone: no hydration error.
      hydration.expectNone();
      await toastsSettled(page);
      await expectAxeClean(page);

      // An empty group name is refused in the form, with the focus on the field.
      await page.getByRole("button", { name: text.members_new_group_title, exact: true }).click();
      const dialog = page.getByRole("dialog", { name: text.members_new_group_title });
      await dialog.getByRole("button", { name: text.members_new_group_submit }).click();
      await expect(dialog.getByText(text.members_group_name_required)).toBeVisible();
      await expect(dialog.getByLabel(text.members_group_name_label, { exact: true })).toBeFocused();
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
      // The members URL leads a participant to the home, where "About this project" holds it.
      await page.goto(membersUrl(project));
      await expect(page).toHaveURL((url) => url.pathname === homeUrl(project));
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      const panel = await openAbout(page, project, locale);
      await expect(aboutGroup(panel, FIRST_GROUP)).toContainText(
        fill(text.projects_about_people_many, { count: 2 }),
      );
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

    test("the facilitator turns the group names on and off, and a participant sees them only when on (PR7)", async ({
      page,
      context,
      db,
    }) => {
      const project = await seedProject(db);
      const participant = await seedParticipant(db, project);
      const other = await seedParticipant(db, project);
      const otherName = `Invented Nurse ${locale}`;
      await nameAccount(db, other, otherName);

      async function setNames(on: boolean, saved: string) {
        await context.clearCookies();
        await signIn(page, project.facilitator.email, locale);
        await page.goto(settingsUrl(project));
        const box = page.getByRole("checkbox", { name: text.members_names_label });
        await expectHydrated(box);
        await expect(box).toBeChecked({ checked: !on });
        await box.click();
        await page.getByRole("button", { name: text.members_names_save }).click();
        await expect(page.getByText(saved)).toBeVisible();
        await expect(box).toBeChecked({ checked: on });
        await toastsSettled(page);
        await expectAxeClean(page);
      }

      async function asParticipant() {
        await context.clearCookies();
        await signIn(page, participant, locale);
        const panel = await openAbout(page, project, locale);
        await expect(panel.getByRole("heading", { name: FIRST_GROUP })).toBeVisible();
        return panel;
      }

      await setNames(true, text.members_names_shown);
      const named = await asParticipant();
      const group = aboutGroup(named, FIRST_GROUP);
      await expect(group).toContainText(otherName);
      await expect(page.getByText(other)).toHaveCount(0);
      await expect(group).not.toContainText(fill(text.projects_about_people_many, { count: 2 }));
      await expectAxeClean(page);

      await setNames(false, text.members_names_hidden);
      const counted = await asParticipant();
      await expect(aboutGroup(counted, FIRST_GROUP)).toContainText(
        fill(text.projects_about_people_many, { count: 2 }),
      );
      await expect(page.getByText(otherName)).toHaveCount(0);
      await expectAxeClean(page);
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
  const dialog = await openInviteDialog(page, "en");
  await dialog.getByLabel(text.members_invite_email_label, { exact: true }).fill(email);
  await dialog.getByLabel(text.members_invite_group_label, { exact: true }).click();
  await page.getByRole("option", { name: /^Nursing/ }).click();
  await dialog.getByRole("button", { name: text.members_invite_submit, exact: true }).click();
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
  const panel = await openAbout(page, project, "en");
  await expect(aboutGroup(panel, "Nursing")).toContainText(text.projects_about_people_one);

  await context.clearCookies();
  await signIn(page, project.facilitator.email);
  await page.goto(membersUrl(project));
  await expect(groupPeople(page, "Nursing")).toContainText(email);
  // Only open invitations are listed; the accepted one waits behind the disclosure.
  await expect(page.getByText(text.members_invitations_none_open)).toBeVisible();
  await page.getByText(fill(text.members_invitations_earlier, { count: 1 })).click();
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
  const panel = await openAbout(page, project, "en");
  await panel.getByRole("button", { name: text.members_leave, exact: true }).click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: text.members_leave_confirm, exact: true })
    .click();
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
  await expect(page.getByRole("heading", { name: text.projects_empty_title })).toBeVisible();
  await page.goto(homeUrl(project));
  await expect(
    page.getByRole("heading", { level: 1, name: text.projects_not_found_title }),
  ).toBeVisible();
});
