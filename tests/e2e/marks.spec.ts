// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// "I support this" and "same as" after the reveal, in English and Dutch (EL15, EL16): two
// participants mark the same pair as the same and one supports an element; a hint's "Same as
// this" adds support and no element; the facilitator sees the counts without names, opens the
// merge from the list of possible duplicates and merges. The board keeps 10 rows on a 1280 by
// 800 screen (Q-USE-1). Every page is axe-clean in light and dark (Q-ACC-1).
import { randomBytes } from "node:crypto";
import type { Browser, Page } from "@playwright/test";
import { insertElement } from "../../src/server/test-fixtures.ts";
import { expectAxeCleanAfterToasts } from "./axe.ts";
import { seedReveal } from "./board-seed.ts";
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
} from "./fixtures.ts";
import { appUrl } from "./run-env.ts";

type Text = (typeof MESSAGES)[Locale];

const SCREEN = { width: 1280, height: 800 };

/** Three elements to mark, then fillers, so the board is long enough for Q-USE-1. */
const ELEMENTS = [
  "Heart rate",
  "Pulse rate",
  "Rhythm",
  "Body position",
  "Exertion",
  "Measurement site",
  "Method",
  "Device type",
  "Irregularity",
  "Comment",
  "Confounding factors",
  "Time of measurement",
];

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

/** A signed-in page for `email` in a context of its own, recording server function bodies. */
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
    viewport: SCREEN,
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

/** Axe in light and in dark, then back to light. */
async function axeBothThemes(page: Page): Promise<void> {
  const html = page.locator("html");
  const settle = async (scheme: "light" | "dark") => {
    // The app follows the browser's colour scheme through `data-theme`.
    await page.emulateMedia({ colorScheme: scheme });
    await expect(html).toHaveAttribute("data-theme", scheme);
    // A hovered button and a colour fade are not what a reader sees at rest.
    await page.mouse.move(0, 0);
    await expect.poll(() => page.evaluate(() => document.getAnimations().length)).toBe(0);
  };
  for (const scheme of ["light", "dark"] as const) {
    await settle(scheme);
    await expectAxeCleanAfterToasts(page);
  }
  await settle("light");
}

/** Opens the details of an element on the board and returns its marks region. */
async function openMarks(page: Page, text: Text, name: string) {
  const toggle = page.getByRole("button", { name, exact: true });
  await expectHydrated(toggle);
  if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  const marks = page.getByRole("region", { name: fill(text.board_marks_label, { name }) });
  await expect(marks).toBeVisible();
  return marks;
}

/** Marks `name` as the same as the element labelled `other` ("2. Pulse rate"). */
async function markSame(page: Page, text: Text, name: string, other: string): Promise<void> {
  const marks = await openMarks(page, text, name);
  await marks.getByLabel(text.board_same_as_label).selectOption({ label: other });
  await marks.getByRole("button", { name: text.board_same_as_submit }).click();
  await expect(
    page.getByText(fill(text.board_same_as_added, { name, other }), { exact: true }),
  ).toBeVisible();
  await expect(marks.getByRole("list").getByText(other, { exact: true })).toBeVisible();
}

/** The cells of an element's row on the board. */
function rowOf(page: Page, name: string) {
  return page.getByRole("row").filter({ has: page.getByRole("rowheader", { name, exact: true }) });
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`marks in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce", viewport: SCREEN });
    const text = MESSAGES[locale];

    test("participants mark, the facilitator merges a proposed pair", async ({ db, browser }) => {
      test.setTimeout(180_000);
      const project = await seedProject(db, "discover");
      const first = await seedParticipant(db, project);
      const second = await seedParticipant(db, project);
      for (const name of ELEMENTS) await insertElement(db, project.projectId, name);
      await seedReveal(db, project.facilitator.userId, project.projectId);
      const board = `/projects/${project.projectId}/board`;
      const brainstorm = `/projects/${project.projectId}/brainstorm`;

      // Participant A marks Pulse rate as the same as Heart rate and supports Heart rate.
      const a = await pageFor(browser, locale, first);
      await a.page.goto(board);
      await markSame(a.page, text, "Pulse rate", "1. Heart rate");
      await axeBothThemes(a.page);
      await a.page.getByRole("button", { name: "Pulse rate", exact: true }).click();
      const heart = await openMarks(a.page, text, "Heart rate");
      const support = heart.getByRole("button", { name: text.board_support_toggle });
      await expect(support).toHaveAttribute("aria-pressed", "false");
      await support.click();
      await expect(support).toHaveAttribute("aria-pressed", "true");
      await expect(
        a.page.getByText(fill(text.board_support_added, { name: "Heart rate" }), { exact: true }),
      ).toBeVisible();
      // The pair shows on both elements, as the participant's own mark.
      await expect(
        heart.getByRole("list").getByText("2. Pulse rate", { exact: true }),
      ).toBeVisible();
      await axeBothThemes(a.page);
      await a.page.screenshot({ path: test.info().outputPath(`participant-board-${locale}.png`) });

      // Participant B marks the same pair the other way round and sees none of A's marks.
      const b = await pageFor(browser, locale, second);
      await b.page.goto(board);
      const bHeart = await openMarks(b.page, text, "Heart rate");
      await expect(bHeart.getByRole("button", { name: text.board_support_toggle })).toHaveAttribute(
        "aria-pressed",
        "false",
      );
      await expect(bHeart.getByRole("list")).toHaveCount(0);
      await b.page.getByRole("button", { name: "Heart rate", exact: true }).click();
      await markSame(b.page, text, "Heart rate", "2. Pulse rate");
      await expect(
        b.page.getByRole("columnheader", { name: text.board_column_support }),
      ).toHaveCount(0);
      await axeBothThemes(b.page);

      // A hint's "Same as this" supports Rhythm and adds nothing.
      await b.page.goto(brainstorm);
      const form = b.page.getByRole("form", {
        name: fill(text.board_column_add_label, { question: text.board_prompt_recorded }),
      });
      const name = form.getByRole("textbox");
      await expectHydrated(name);
      await name.fill("rhythm");
      const hints = form.getByRole("list", { name: text.board_hints_list_label });
      await expect(hints.getByRole("link", { name: "Rhythm", exact: true })).toBeVisible();
      await expect(form.getByText(text.board_hints_help_same)).toBeVisible();
      await axeBothThemes(b.page);
      await hints
        .getByRole("listitem")
        .filter({ has: b.page.getByRole("link", { name: "Rhythm", exact: true }) })
        .getByRole("button", { name: text.board_hints_same })
        .click();
      await expect(
        b.page.getByText(fill(text.board_hints_marked_same, { name: "Rhythm" }), { exact: true }),
      ).toBeVisible();
      await expect(name).toHaveValue("");
      // Nothing was added: the own count stays at zero.
      await expect(b.page.getByText(fill(text.board_strip_own, { count: 0 }))).toBeVisible();
      await axeBothThemes(b.page);
      await b.page.goto(board);
      await expect(
        b.page.getByRole("table", { name: text.board_list_label }).getByRole("rowheader"),
      ).toHaveCount(ELEMENTS.length);
      const rhythm = await openMarks(b.page, text, "Rhythm");
      await expect(rhythm.getByRole("button", { name: text.board_support_toggle })).toHaveAttribute(
        "aria-pressed",
        "true",
      );

      // No response to one participant names the other or the facilitator.
      for (const [own, other] of [
        [a, second],
        [b, first],
      ] as const) {
        for (const body of own.bodies) {
          expect(body).not.toContain(other);
          expect(body).not.toContain(project.facilitator.email);
        }
      }

      // The facilitator sees the counts, without names, and merges the proposed pair.
      const facilitator = await pageFor(browser, locale, project.facilitator.email);
      await facilitator.page.goto(board);
      const page = facilitator.page;
      await expect(
        page.getByRole("columnheader", { name: text.board_column_support }),
      ).toBeVisible();
      await expect(rowOf(page, "Heart rate").getByRole("cell").last()).toHaveText("1");
      await expect(rowOf(page, "Rhythm").getByRole("cell").last()).toHaveText("1");
      await expect(rowOf(page, "Pulse rate").getByRole("cell").last()).toHaveText("0");
      // Q-USE-1: 10 rows on the first screen, with the list of duplicates above the table.
      const rows = page.locator("tbody > tr:not([hidden])");
      expect(await page.evaluate(() => window.scrollY)).toBe(0);
      const tenth = await rows.nth(9).boundingBox();
      expect((tenth?.y ?? Number.POSITIVE_INFINITY) + (tenth?.height ?? 0)).toBeLessThanOrEqual(
        SCREEN.height,
      );
      await axeBothThemes(page);
      await page.screenshot({ path: test.info().outputPath(`facilitator-board-${locale}.png`) });

      const duplicates = page.getByRole("button", {
        name: fill(text.board_duplicates_title, { count: 1 }),
      });
      await expectHydrated(duplicates);
      await duplicates.click();
      const pair = fill(text.board_duplicates_pair, {
        first: "1. Heart rate",
        second: "2. Pulse rate",
      });
      const item = page.getByRole("listitem").filter({ hasText: pair });
      await expect(item).toContainText(fill(text.board_duplicates_count, { count: 2 }));
      await axeBothThemes(page);
      await page.screenshot({
        path: test.info().outputPath(`facilitator-duplicates-${locale}.png`),
      });
      for (const body of facilitator.bodies) {
        expect(body).not.toContain(first);
        expect(body).not.toContain(second);
      }

      await item.getByRole("button", { name: text.board_duplicates_merge }).click();
      const dialog = page.getByRole("dialog", { name: text.board_merge_title });
      await expect(dialog).toBeVisible();
      await expect(
        dialog.getByLabel(text.board_merge_into_label).locator("option:checked"),
      ).toHaveText("1. Heart rate");
      await expect(dialog.getByRole("checkbox", { name: "2. Pulse rate" })).toBeChecked();
      await axeBothThemes(page);
      await dialog.getByRole("button", { name: text.board_merge_submit, exact: true }).click();
      await expect(dialog).toHaveCount(0);
      await expect(
        page.getByText(fill(text.board_merged, { name: "1. Heart rate" }), { exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("rowheader", { name: "Pulse rate", exact: true })).toHaveCount(0);
      await expect(page.getByRole("button", { name: /\(\d+\)$/ })).toHaveCount(0);
      await expect(rowOf(page, "Heart rate").getByRole("cell").last()).toHaveText("1");
      await axeBothThemes(page);
    });
  });
}
