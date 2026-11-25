// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The private-first brainstorm board in English and Dutch (EL13 to EL15, EL23, ADR 0012, ADR
// 0020): in a new project participant A adds elements in two question columns and sees only
// their own; participant B sees none of them, only a count per column; the facilitator sees both
// and reveals the board; then both see every element without authors (EL2), and typing a similar
// name in a column shows a hint that opens the element on the board. Every page and dialog is
// axe-clean (Q-ACC-1, Q-I18N-1).
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

/** The add form at the foot of a question's column. */
function columnForm(page: Page, text: Text, question: string) {
  return page.getByRole("form", { name: fill(text.board_column_add_label, { question }) });
}

/** Adds an element in a question's column with Enter, as a participant does. */
async function quickAdd(page: Page, text: Text, question: string, name: string): Promise<void> {
  const field = columnForm(page, text, question).getByRole("textbox");
  await expectHydrated(field);
  await field.fill(name);
  await field.press("Enter");
  // The field empties, keeps the focus, and the element shows under "Yours" in that column.
  await expect(field).toHaveValue("");
  await expect(field).toBeFocused();
  await expect(
    page
      .getByRole("region", { name: question })
      .getByRole("list", { name: text.board_column_yours })
      .getByText(name, { exact: true }),
  ).toBeVisible();
}

/** The name cells of the board, one per element. */
function boardRows(page: Page, text: Text) {
  return page.getByRole("table", { name: text.board_list_label }).getByRole("rowheader");
}

/** The names of the participant's board list, each with its number before the name. */
function participantRows(page: Page, text: Text) {
  return page.getByRole("list", { name: text.board_list_label }).getByRole("button", {
    expanded: false,
  });
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`brainstorm in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce" });
    const text = MESSAGES[locale];
    const recorded = text.board_prompt_recorded;
    const method = text.board_prompt_method;

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
      // The task card on the project home leads to the brainstorm (PR8, ADR 0019).
      await a.page.goto(`/projects/${project.projectId}`);
      const task = a.page.getByRole("region", { name: text.projects_home_turn_discover });
      await task.getByRole("link", { name: text.projects_task_discover_action }).click();
      await expect(
        a.page.getByRole("heading", { level: 2, name: text.board_brainstorm_title }),
      ).toBeVisible();
      // The done scope step links to its recap and the current one to the home; the way on is
      // back to the task.
      await expect(
        a.page.getByRole("list", { name: text.projects_steps_label }).getByRole("link"),
      ).toHaveCount(2);
      await expect(a.page.getByRole("link", { name: text.projects_back_task })).toHaveAttribute(
        "href",
        `/projects/${project.projectId}`,
      );
      await expect(a.page.getByText(text.board_brainstorm_purpose_private)).toBeVisible();
      await expect(a.page.getByText(fill(text.board_strip_own, { count: 0 }))).toBeVisible();
      // The task bar counts what A added and never says they are done: adding is open-ended (P1).
      const bar = a.page.getByTestId("task-bar");
      await expect(bar.getByRole("status")).toHaveText(fill(text.projects_bar_added, { count: 0 }));
      await expectAxeCleanInBothThemes(a.page);
      await quickAdd(a.page, text, recorded, "Systolic pressure");
      await quickAdd(a.page, text, method, "Cuff size");
      await expect(a.page.getByText(fill(text.board_strip_own, { count: 2 }))).toBeVisible();
      await expect(bar.getByRole("status")).toHaveText(fill(text.projects_bar_added, { count: 2 }));
      await expect(bar.getByRole("heading")).toHaveCount(0);
      // The task card on the home counts the participant's own elements.
      await a.page.getByRole("link", { name: text.projects_back_task }).click();
      await expect(
        a.page.getByRole("region", { name: text.projects_home_turn_discover }).locator("dd"),
      ).toHaveText("2");
      await a.page.goto(brainstorm);
      await axeClean(a.page);
      await expectAxeCleanInBothThemes(a.page);

      // Participant B adds one and sees none of A's, on any page or in any response.
      const b = await pageFor(browser, locale, second);
      await b.page.goto(brainstorm);
      await quickAdd(b.page, text, recorded, "Diastolic pressure");
      // B sees A's elements only as a count per column.
      await expect(
        b.page
          .getByRole("region", { name: recorded })
          .getByText(fill(text.board_column_hidden, { count: 1 })),
      ).toBeVisible();
      await expect(
        b.page.getByText(fill(text.board_strip_people, { contributors: 2, total: 2 })),
      ).toBeVisible();
      // The strip counts only the others' hidden elements, as the columns do, and B's own.
      await expect(
        b.page.getByText(fill(text.board_column_hidden, { count: 2 }), { exact: true }),
      ).toBeVisible();
      await expect(b.page.getByText(fill(text.board_strip_own, { count: 1 }))).toBeVisible();
      // Before the reveal a similar name shows no hint.
      const bName = columnForm(b.page, text, text.board_prompt_patient_state).getByRole("textbox");
      await bName.fill("Systolic");
      await expect(b.page.getByRole("list", { name: text.board_hints_list_label })).toHaveCount(0);
      await bName.fill("");
      await b.page.goto(board);
      await expect(b.page.getByText(text.board_private_participant_note)).toBeVisible();
      await expect(participantRows(b.page, text)).toHaveText([/Diastolic pressure$/]);
      await axeClean(b.page);
      for (const body of [...b.bodies, await b.page.content()]) {
        expect(body).not.toContain("Systolic pressure");
        expect(body).not.toContain("Cuff size");
      }
      await a.page.goto(board);
      await expect(participantRows(a.page, text)).toHaveText([/Systolic pressure$/, /Cuff size$/]);

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
        await expect(participantRows(participant.page, text)).toHaveCount(3);
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
      await expect(b.page.getByText(text.board_brainstorm_purpose_shared)).toBeVisible();
      await expect(
        b.page
          .getByRole("region", { name: recorded })
          .getByRole("list", { name: text.board_column_from_others })
          .getByText("Systolic pressure"),
      ).toBeVisible();
      const form = columnForm(b.page, text, text.board_prompt_patient_state);
      const name = form.getByRole("textbox");
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
