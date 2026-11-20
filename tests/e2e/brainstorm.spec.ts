// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The private-first brainstorm in English and Dutch (EL13 to EL15, ADR 0012, ADR 0018): in a new
// project participant A adds elements under two chosen questions in the one quick-add form and
// sees only their own, grouped by question; participant B sees
// none of them; the facilitator sees both and reveals the board; then both see every element
// without authors (EL2), and typing a similar name shows a hint that opens the element on the
// board. Every page and dialog is axe-clean (Q-ACC-1, Q-I18N-1).
import { randomBytes } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { seedScope } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectAxeCleanInBothThemes,
  expectHydrated,
  type Locale,
  MESSAGES,
  requestSignInLink,
  seedParticipant,
  seedProject,
  test,
} from "./fixtures.ts";
import { appUrl } from "./run-env.ts";

type Text = (typeof MESSAGES)[Locale];

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** Waits until the toasts have faded in, so axe measures them as read, then checks the page. */
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

/**
 * A signed-in page for `email` in a context of its own, with its own client address. It records
 * the body of every server function response, so a test can look for leaked text.
 */
async function pageFor(
  browser: Browser,
  locale: Locale,
  email: string,
): Promise<{ page: Page; bodies: string[] }> {
  const [a, b, c] = randomBytes(3);
  const context = await browser.newContext({
    baseURL: appUrl(),
    locale: BROWSER_LOCALE[locale],
    reducedMotion: "reduce",
    extraHTTPHeaders: { "X-Forwarded-For": `10.${a}.${b}.${c}` },
  });
  const page = await context.newPage();
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (response.url().includes("_serverFn")) bodies.push(await response.text().catch(() => ""));
  });
  await page.goto(await requestSignInLink(page, email, locale));
  await expect(page).toHaveURL((url) => url.pathname === "/projects");
  return { page, bodies };
}

/** The brainstorm's one quick-add form. */
function quickAddForm(page: Page, text: Text) {
  return page.getByRole("form", { name: text.board_brainstorm_add_title });
}

/** Chooses a question in the quick-add form by its short name. */
async function chooseQuestion(page: Page, text: Text, label: string): Promise<void> {
  const group = quickAddForm(page, text).getByRole("group", {
    name: text.board_quick_question_label,
  });
  await expectHydrated(group.getByRole("radio").first());
  await group.getByText(label, { exact: true }).click();
  await expect(group.getByRole("radio", { name: label })).toBeChecked();
}

/** Adds an element under a chosen question with Enter, as a participant does. */
async function quickAdd(
  page: Page,
  text: Text,
  question: { label: string; full: string },
  name: string,
  line = "",
): Promise<void> {
  await chooseQuestion(page, text, question.label);
  const form = quickAddForm(page, text);
  const field = form.getByLabel(text.board_quick_name_label, { exact: true });
  await field.fill(name);
  if (line !== "") await form.getByLabel(text.board_quick_description_label).fill(line);
  await field.press("Enter");
  // The form empties and the element shows in the list of that question.
  await expect(field).toHaveValue("");
  await expect(
    page.getByRole("list", { name: question.full }).getByText(name, { exact: true }),
  ).toBeVisible();
}

/** The name cells of the board, one per element. */
function boardRows(page: Page, text: Text) {
  return page.getByRole("table", { name: text.board_list_label }).getByRole("rowheader");
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`brainstorm in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce" });
    const text = MESSAGES[locale];
    const recorded = { label: text.board_prompt_short_recorded, full: text.board_prompt_recorded };
    const method = { label: text.board_prompt_short_method, full: text.board_prompt_method };

    test("private first, then the facilitator reveals the board", async ({ db, browser }) => {
      test.setTimeout(180_000);
      const project = await seedProject(db, "discover");
      await seedScope(db, project.facilitator.userId, project.projectId, {
        concept: "The blood pressure of an adult at the outpatient clinic.",
        useCases: "Outpatient visit.",
        outOfScope: "Invasive pressure.",
      });
      const first = await seedParticipant(db, project);
      const second = await seedParticipant(db, project);
      const brainstorm = `/projects/${project.projectId}/brainstorm`;
      const board = `/projects/${project.projectId}/board`;

      // Participant A adds under two questions and sees only their own elements.
      const a = await pageFor(browser, locale, first);
      await a.page.goto(`/projects/${project.projectId}/scope`);
      await a.page.getByRole("link", { name: text.projects_tab_brainstorm }).click();
      await expect(
        a.page.getByRole("heading", { level: 2, name: text.board_brainstorm_title }),
      ).toBeVisible();
      // The header carries the one line of the scope (PR11).
      await expect(a.page.getByTestId("project-scope-line")).toHaveText(
        "The blood pressure of an adult at the outpatient clinic.",
      );
      await expect(a.page.getByText(text.board_brainstorm_private_note)).toBeVisible();
      await expect(
        a.page.getByRole("heading", { name: fill(text.board_brainstorm_yours, { count: 0 }) }),
      ).toBeVisible();
      await expectAxeCleanInBothThemes(a.page);
      await quickAdd(a.page, text, recorded, "Systolic pressure");
      await quickAdd(a.page, text, method, "Cuff size", "The size of the cuff used.");
      await expect(
        a.page.getByRole("heading", { name: fill(text.board_brainstorm_yours, { count: 2 }) }),
      ).toBeVisible();
      // The task line in the header counts the participant's own elements.
      await expect(a.page.getByRole("region", { name: text.projects_task_heading })).toContainText(
        fill(text.projects_task_discover_many, { count: 2 }),
      );
      await axeClean(a.page);
      await expectAxeCleanInBothThemes(a.page);

      // Participant B adds one and sees none of A's, on any page or in any response.
      const b = await pageFor(browser, locale, second);
      await b.page.goto(brainstorm);
      await quickAdd(b.page, text, recorded, "Diastolic pressure");
      // Before the reveal a similar name shows no hint.
      await chooseQuestion(b.page, text, text.board_prompt_short_patient_state);
      const bName = quickAddForm(b.page, text).getByLabel(text.board_quick_name_label, {
        exact: true,
      });
      await bName.fill("Systolic");
      await expect(b.page.getByRole("list", { name: text.board_hints_list_label })).toHaveCount(0);
      await bName.fill("");
      await b.page.goto(board);
      await expect(b.page.getByText(text.board_private_participant_note)).toBeVisible();
      await expect(boardRows(b.page, text)).toHaveText(["Diastolic pressure"]);
      await axeClean(b.page);
      for (const body of [...b.bodies, await b.page.content()]) {
        expect(body).not.toContain("Systolic pressure");
        expect(body).not.toContain("Cuff size");
      }
      await a.page.goto(board);
      await expect(boardRows(a.page, text)).toHaveText(["Systolic pressure", "Cuff size"]);

      // The facilitator sees both participants' elements and reveals the board.
      const facilitator = await pageFor(browser, locale, project.facilitator.email);
      await facilitator.page.goto(board);
      await expect(boardRows(facilitator.page, text)).toHaveCount(3);
      await expect(facilitator.page.getByTestId("private-step-status")).toHaveText(
        fill(text.board_private_status, { elements: 3, participants: 2, total: 2 }),
      );
      await axeClean(facilitator.page);
      const reveal = facilitator.page.getByRole("button", { name: text.board_reveal });
      await expectHydrated(reveal);
      await reveal.click();
      const dialog = facilitator.page.getByRole("alertdialog", {
        name: text.board_reveal_confirm_title,
      });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByRole("table", { name: text.board_private_counts }).getByRole("row"),
      ).toHaveCount(3);
      await axeClean(facilitator.page);
      await dialog.getByRole("button", { name: text.board_reveal_confirm }).click();
      await expect(dialog).toHaveCount(0);
      await expect(facilitator.page.getByTestId("private-step-status")).toHaveCount(0);
      await axeClean(facilitator.page);

      // After the reveal both participants see every element, without an author.
      for (const participant of [a, b]) {
        await participant.page.goto(board);
        await expect(boardRows(participant.page, text)).toHaveCount(3);
        await expect(participant.page.getByText(text.board_private_participant_note)).toHaveCount(
          0,
        );
        await expect(participant.page.getByText(text.board_field_author)).toHaveCount(0);
      }
      // A response may name the person signed in, never another member.
      for (const [own, other] of [
        [a, second],
        [b, first],
      ] as const) {
        for (const body of own.bodies) {
          expect(body).not.toContain(other);
          expect(body).not.toContain(project.facilitator.email);
        }
      }

      // Typing a similar name shows a hint that opens the element on the board.
      await b.page.goto(brainstorm);
      await expect(b.page.getByText(text.board_brainstorm_shared_note)).toBeVisible();
      const form = quickAddForm(b.page, text);
      const name = form.getByLabel(text.board_quick_name_label, { exact: true });
      await expectHydrated(name);
      await name.fill("systolic");
      const hints = form.getByRole("list", { name: text.board_hints_list_label });
      await expect(hints.getByRole("link")).toHaveText(["Systolic pressure"]);
      await axeClean(b.page);
      await hints.getByRole("link", { name: "Systolic pressure" }).click();
      await expect(b.page).toHaveURL((url) => url.pathname === board);
      await expect(
        b.page.getByRole("button", { name: "Systolic pressure", exact: true }),
      ).toHaveAttribute("aria-expanded", "true");
      await axeClean(b.page);
    });
  });
}
