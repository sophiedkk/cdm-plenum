// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A consent round of a Team project in the browser, in English and Dutch (DE20, DE18, ADR 0023,
// Q-ACC-1): the facilitator sets up a round with no scale or rule and opens it, a member answers
// card by card at 1280 by 800 pixels (a reason is required for Leave out and Discuss, with the
// error at the field), the round closes, everyone reads each answer by name, and the facilitator
// settles the element that is "To discuss" with a note.
import { randomBytes } from "node:crypto";
import type { Browser, Locator, Page } from "@playwright/test";
import { type Kysely, sql } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { saveConsent } from "../../src/server/rounds/consent.ts";
import { insertElement } from "../../src/server/test-fixtures.ts";
import { expectAxeCleanAfterToasts } from "./axe.ts";
import { userIdOf } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
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

/** The value of a `datetime-local` input one day from now, in the browser's (local) zone. */
function tomorrowInput(): string {
  const date = new Date(Date.now() + 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T17:00`;
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

/** A participant of the project with a name every member sees. */
async function namedParticipant(
  db: Kysely<DB>,
  project: Awaited<ReturnType<typeof seedProject>>,
  name: string,
): Promise<{ email: string; userId: string }> {
  const email = await seedParticipant(db, project);
  const userId = await userIdOf(db, email);
  await db.updateTable("user").set({ name }).where("id", "=", userId).execute();
  return { email, userId };
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`a consent round in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];
    const label = {
      include: text.rounds_consent_include,
      leave_out: text.rounds_consent_leave_out,
      discuss: text.rounds_consent_discuss,
    };

    test("from setup to answers, results by name and settling", async ({ page, db, browser }) => {
      test.setTimeout(180_000);
      const project = await seedProject(db, "decide");
      const { projectId } = project;
      await db.updateTable("project").set({ mode: "team" }).where("id", "=", projectId).execute();
      const ann = await namedParticipant(db, project, uniqueName("Ann"));
      const bo = await namedParticipant(db, project, uniqueName("Bo"));
      const names = {
        ann: (
          await db
            .selectFrom("user")
            .select("name")
            .where("id", "=", ann.userId)
            .executeTakeFirstOrThrow()
        ).name,
        bo: (
          await db
            .selectFrom("user")
            .select("name")
            .where("id", "=", bo.userId)
            .executeTakeFirstOrThrow()
        ).name,
      };
      const elementIds = [
        await insertElement(db, projectId, "Systolic pressure"),
        await insertElement(db, projectId, "Cuff size"),
        await insertElement(db, projectId, "Body position"),
      ];
      const rounds = `/projects/${projectId}/rounds`;

      // Setup: no scale, no rule and no rater setting; the elements and the closing date remain.
      await page.goto(await requestSignInLink(page, project.facilitator.email, locale));
      await expect(page).toHaveURL((url) => url.pathname === "/projects");
      await page.goto(`${rounds}/new`);
      const closesAt = page.getByLabel(text.rounds_closes_at_label);
      await expectHydrated(closesAt);
      await expect(page.getByText(text.rounds_consent_setup_note)).toBeVisible();
      await expect(page.getByLabel(text.rounds_scale_min_label)).toHaveCount(0);
      await expect(page.getByLabel(text.rounds_agreement_label)).toHaveCount(0);
      await expect(page.getByLabel(text.rounds_sees_raters_label)).toHaveCount(0);
      await expectAxeCleanAfterToasts(page);
      await closesAt.fill(tomorrowInput());
      await page.getByRole("button", { name: text.rounds_create }).click();
      const roundName = fill(text.rounds_round_name, { number: 1 });
      await expect(
        page.getByRole("heading", { level: 2, name: roundName, exact: true }),
      ).toBeVisible();
      const roundUrl = page.url();
      const roundId = roundUrl.split("/").at(-1) ?? "";
      await expectAxeCleanAfterToasts(page);

      // The panel is below the minimum, so opening asks for a reason.
      const openButton = page.getByRole("button", { name: text.rounds_open_button });
      await expectHydrated(openButton);
      await openButton.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("button", { name: text.rounds_open_confirm }).click();
      await dialog.getByLabel(text.rounds_open_reason_label).fill("A teaching group of two");
      await dialog.getByRole("button", { name: text.rounds_open_with_reason }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(text.rounds_status_open, { exact: true }).first()).toBeVisible();
      await expect(page.getByText(text.rounds_consent_rule_short)).toBeVisible();
      await expect(page.getByText(text.rounds_setup_details)).toHaveCount(0);
      await expectAxeCleanAfterToasts(page);

      // The first member answers card by card; the card fits the first screen (DE18).
      const member = await pageFor(browser, locale, ann.email);
      await member.goto(`${rounds}/${roundId}/rate`);
      const bar = member.getByTestId("task-bar");
      await expect(bar).toContainText(fill(text.projects_task_consent, { number: 1 }));
      await expect(bar.getByRole("status")).toHaveText(
        fill(text.rounds_consent_progress, { rated: 0, total: 3 }),
      );
      await expect(member.getByText(text.rounds_rate_hidden_title)).toHaveCount(0);
      await expect(member.getByText(text.rounds_consent_named)).toBeVisible();
      const systolic = member.getByRole("region", { name: "Systolic pressure" });
      const include = systolic.getByRole("radio", { name: label.include });
      await expectHydrated(include);
      await expect(systolic.getByRole("radio", { name: "7", exact: true })).toHaveCount(0);
      expect(await bottomOf(member, systolic)).toBeLessThanOrEqual(SCREEN.height);
      await expectAxeCleanAfterToasts(member);
      await include.click();
      await expect(systolic.getByRole("status").first()).toHaveText(
        fill(text.rounds_consent_saved, { answer: label.include }),
      );
      await member.getByRole("link", { name: text.rounds_card_next }).click();

      // Leave out needs a reason: the error stands at the field, and the answer waits for it.
      const cuff = member.getByRole("region", { name: "Cuff size" });
      await cuff.getByRole("radio", { name: label.leave_out }).click();
      const reason = cuff.getByLabel(text.rounds_consent_reason_required);
      await expect(reason).toHaveAttribute("aria-invalid", "true");
      await expect(reason).toHaveAccessibleDescription(text.common_refusal_consent_reason_required);
      await expectAxeCleanAfterToasts(member);
      await reason.fill("Covered by the position element");
      await reason.blur();
      await expect(cuff.getByRole("status").first()).toHaveText(
        fill(text.rounds_consent_saved, { answer: label.leave_out }),
      );
      await member.getByRole("link", { name: text.rounds_card_next }).click();
      const position = member.getByRole("region", { name: "Body position" });
      await position.getByRole("radio", { name: label.discuss }).click();
      await position.getByLabel(text.rounds_consent_reason_required).fill("Unclear definition");
      await position.getByLabel(text.rounds_consent_reason_required).blur();
      await expect(position.getByRole("status").first()).toHaveText(
        fill(text.rounds_consent_saved, { answer: label.discuss }),
      );
      await expect(bar.getByRole("status")).toContainText(
        fill(text.rounds_consent_progress, { rated: 3, total: 3 }),
      );
      await expect(bar).toContainText(text.projects_bar_consent_done);
      // After the last card the overview lists the member's own answers.
      await member.getByRole("link", { name: text.rounds_card_next }).click();
      const overview = member.getByRole("table", {
        name: fill(text.rounds_consent_overview_caption, { number: 1 }),
      });
      await expect(overview.getByRole("row").filter({ hasText: "Cuff size" })).toContainText(
        label.leave_out,
      );
      await expectAxeCleanAfterToasts(member);

      // The second member answers through the server: include, leave out, include.
      for (const [index, answer, why] of [
        [0, "include", undefined],
        [1, "leave_out", "Not needed for triage"],
        [2, "include", undefined],
      ] as const) {
        const saved = await saveConsent(db, bo.userId, {
          projectId,
          roundId,
          elementId: elementIds[index] ?? "",
          answer,
          ...(why === undefined ? {} : { reason: why }),
        });
        if (!saved.ok) throw new Error(`answer refused: ${saved.error}`);
      }

      // The facilitator closes the round after its date.
      await passClosingDate(db, roundId);
      await page.reload();
      const close = page.getByRole("button", { name: text.rounds_close_button });
      await expectHydrated(close);
      await close.click();
      await expect(page.getByRole("alertdialog")).toContainText(
        text.rounds_consent_close_explained,
      );
      await page
        .getByRole("alertdialog")
        .getByRole("button", { name: text.rounds_close_confirm })
        .click();

      // Systolic: both include. Cuff size: both leave out. Body position: discuss and include.
      const results = page.getByRole("region", { name: text.rounds_results_heading });
      await expect(results).toBeVisible();
      const line = (name: string) =>
        results.getByRole("listitem").filter({ hasText: name }).first();
      await expect(line("Systolic pressure")).toContainText(text.rounds_consent_outcome_included);
      await expect(line("Cuff size")).toContainText(text.rounds_consent_outcome_excluded);
      await expect(line("Body position")).toContainText(text.rounds_consent_outcome_no_consensus);
      await expect(page.getByText(text.rounds_consent_discuss_hint)).toBeVisible();
      // Each answer and reason by name.
      await line("Body position")
        .getByText(text.rounds_consent_answers_toggle, { exact: false })
        .click();
      await expect(line("Body position")).toContainText(
        `${names.ann}: ${label.discuss} (Unclear definition)`,
      );
      await expect(line("Body position")).toContainText(`${names.bo}: ${label.include}`);
      await expectAxeCleanAfterToasts(page);

      // Settling needs a decision and a note.
      const settle = line("Body position").getByRole("button", {
        name: new RegExp(`^${text.rounds_consent_settle}\\s*: Body position$`),
      });
      await expectHydrated(settle);
      await expect(
        line("Systolic pressure").getByRole("button", {
          name: new RegExp(text.rounds_consent_settle),
        }),
      ).toHaveCount(0);
      await settle.click();
      const settleDialog = page.getByRole("dialog", {
        name: fill(text.rounds_consent_settle_title, { name: "Body position" }),
      });
      await settleDialog
        .getByRole("button", { name: text.rounds_consent_settle_submit, exact: true })
        .click();
      await expect(
        settleDialog.getByText(text.rounds_consent_settle_outcome_required),
      ).toBeVisible();
      await expect(settleDialog.getByText(text.common_refusal_settle_note_required)).toBeVisible();
      await expectAxeCleanAfterToasts(page);
      await settleDialog
        .getByRole("combobox", { name: text.rounds_consent_settle_outcome_label })
        .click();
      await page
        .getByRole("option", { name: text.rounds_consent_outcome_included, exact: true })
        .click();
      await settleDialog
        .getByLabel(text.rounds_consent_settle_note_label)
        .fill("Agreed in the meeting after a short discussion");
      await settleDialog
        .getByRole("button", { name: text.rounds_consent_settle_submit, exact: true })
        .click();
      await expect(settleDialog).toBeHidden();
      await expect(line("Body position")).toContainText(text.rounds_consent_outcome_included);
      await expect(line("Body position")).toContainText(
        fill(text.rounds_consent_settled_note, {
          note: "Agreed in the meeting after a short discussion",
        }),
      );
      await expect(page.getByText(text.rounds_consent_discuss_hint)).toHaveCount(0);
      await expectAxeCleanAfterToasts(page);

      // Every member reads the answers by name, with no Settle button.
      await member.goto(roundUrl);
      const memberResults = member.getByRole("region", { name: text.rounds_results_heading });
      await expect(memberResults).toContainText(names.bo);
      await expect(memberResults).toContainText(text.rounds_consent_outcome_included);
      await expect(
        memberResults.getByRole("button", { name: new RegExp(text.rounds_consent_settle) }),
      ).toHaveCount(0);
      await expectAxeCleanAfterToasts(member);
      await member.context().close();
    });
  });
}
