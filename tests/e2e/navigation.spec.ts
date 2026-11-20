// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The task-centred navigation in English and Dutch (PR2, PR4, PR8, PR11, ADR 0019): a participant
// goes from Projects to the project home, starts rating from the "Your turn" card, opens the scope
// from the home's links while the steps only show the phase, and opens "About this project"; every
// project page keeps the same left edge; the facilitator lands on the Overview,
// reveals the board from its checklist and moves to decide through the confirmation. Axe-clean in
// the light and the dark theme; the home and the rating card fit a phone without sideways scroll.
import type { Page } from "@playwright/test";
import { type Kysely, sql } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import { closeRound } from "../../src/server/rounds/queries.ts";
import { saveRating } from "../../src/server/rounds/ratings.ts";
import { openedRound } from "../../src/server/rounds/test-round.ts";
import { insertElement, joinedParticipant } from "../../src/server/test-fixtures.ts";
import { seedElement, seedScope, signInTo, userIdOf } from "./board-seed.ts";
import {
  addressOf,
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectAxeCleanInBothThemes,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedParticipant,
  seedProject,
  test,
  uniqueName,
} from "./fixtures.ts";

type Text = (typeof MESSAGES)[Locale];

const PHONE = { width: 390, height: 844 };

/** Fills a message's `{placeholders}`, as Paraglide does. */
function fill(message: string, values: Record<string, string | number>): string {
  return message.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
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

/** Round 1 scores of three nurses: two elements in, one out, one without consensus. */
const ROUND_1: { name: string; scores: number[] }[] = [
  { name: "Systolic", scores: [9, 9, 8] },
  { name: "Diastolic", scores: [8, 9, 9] },
  { name: "Pulse pressure", scores: [1, 2, 1] },
  { name: "Cuff size", scores: [1, 5, 9] },
];

interface Deciding {
  projectId: string;
  round2: string;
  facilitator: string;
  nurse: string;
}

/**
 * A project like the demo in decide: round 1 closed with each outcome, "Comment" added after
 * it, and round 2 open on Cuff size and Comment, so the nurse has two elements to rate.
 */
async function seedDeciding(db: Kysely<DB>): Promise<Deciding> {
  const project = await seedProject(db, "decide");
  const { projectId } = project;
  const facilitator = project.facilitator.userId;
  await seedScope(db, facilitator, projectId, {
    concept: "The blood pressure of an adult at the outpatient clinic.",
    useCases: "Outpatient visit.",
    outOfScope: "Invasive pressure.",
  });
  const names = ROUND_1[0]?.scores.map(() => uniqueName("nurse")) ?? [];
  const raters: string[] = [];
  for (const name of names) {
    raters.push(await joinedParticipant(db, facilitator, projectId, "Nursing", name));
  }
  const ids: string[] = [];
  for (const element of ROUND_1) ids.push(await insertElement(db, projectId, element.name));
  const round1 = await openedRound(db, facilitator, projectId, {}, "An invented test panel");
  for (const [e, element] of ROUND_1.entries()) {
    for (const [r, score] of element.scores.entries()) {
      const saved = await saveRating(db, raters[r] ?? "", {
        projectId,
        roundId: round1,
        elementId: ids[e] ?? "",
        score,
      });
      if (!saved.ok) throw new Error(`rating refused: ${saved.error}`);
    }
  }
  await passClosingDate(db, round1);
  const closed = await closeRound(
    db,
    facilitator,
    { projectId, roundId: round1 },
    { now: new Date() },
  );
  if (!closed.ok) throw new Error(`close refused: ${closed.error}`);
  const comment = await insertElement(db, projectId, "Comment");
  const round2 = await openedRound(
    db,
    facilitator,
    projectId,
    { elementIds: [ids[3] ?? "", comment] },
    "An invented test panel",
  );
  return {
    projectId,
    round2,
    facilitator: project.facilitator.email,
    nurse: addressOf(names[0] ?? ""),
  };
}

/** A screenshot for review, once the colours have faded to the current theme. */
async function snap(page: Page, options: { path: string; fullPage?: boolean }): Promise<void> {
  await page.waitForFunction(() =>
    document.getAnimations().every((animation) => animation.playState !== "running"),
  );
  await page.screenshot(options);
}

/** Whether the page scrolls sideways. */
async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/**
 * Where the project name and the back link start, in pixels from the left: the same on every
 * page, so nothing jumps when you move between pages.
 */
async function leftEdges(page: Page): Promise<{ title: number; back: number }> {
  const title = await page.getByRole("heading", { level: 1 }).boundingBox();
  const back = await page.locator("main a").first().boundingBox();
  if (title === null || back === null) throw new Error("no project header on the page");
  return { title: title.x, back: back.x };
}

function steps(page: Page, text: Text) {
  return page.getByRole("list", { name: text.projects_steps_label });
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`navigation in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], viewport: { width: 1280, height: 800 } });
    const text = MESSAGES[locale];

    test("a participant goes from Projects to the home, rates from the card and finds the scope and About", async ({
      page,
      db,
    }) => {
      const seeded = await seedDeciding(db);
      await signInTo(page, seeded.nurse, locale, "/projects");

      // Projects: the row says what waits and by when.
      const row = page.getByRole("link", { name: /Blood pressure/ });
      await expect(row).toContainText(text.projects_phase_decide);
      await expect(row).toContainText(
        fill(text.projects_waiting_rate_many, { number: 2, count: 2, date: "" }).split(",")[0] ??
          "",
      );
      await expectAxeCleanInBothThemes(page);
      await snap(page, { path: test.info().outputPath(`projects-${locale}.png`) });

      await expectHydrated(row);
      await row.click();
      await expect(page).toHaveURL((url) => url.pathname === `/projects/${seeded.projectId}`);
      await expect(page.getByRole("heading", { level: 1, name: "Blood pressure" })).toBeVisible();
      await expect(page).toHaveTitle(/^Blood pressure \|/);
      // A participant has no tabs: the home is the navigation, and the steps show the phase only.
      await expect(page.getByRole("navigation", { name: text.projects_tabs_label })).toHaveCount(0);
      await expect(steps(page, text).locator('[aria-current="step"]')).toContainText(
        text.projects_phase_decide,
      );
      await expect(steps(page, text).getByRole("link")).toHaveCount(0);
      const edge = await leftEdges(page);

      const card = page.getByRole("region", {
        name: fill(text.projects_home_turn_rate, { number: 2 }),
      });
      await expect(card.locator("time")).toHaveCount(1);
      const start = card.getByRole("link", { name: text.projects_home_rate_start });
      await expect(start).toBeInViewport();

      const decided = page.getByRole("region", { name: text.projects_decided_title });
      await expect(
        decided.getByRole("region", { name: `${text.projects_decided_included} 2` }),
      ).toContainText("Systolic");
      await expect(
        decided.getByRole("region", { name: `${text.projects_decided_excluded} 1` }),
      ).toContainText("Pulse pressure");
      await expect(
        decided.getByRole("region", { name: `${text.projects_decided_open} 1` }),
      ).toContainText("Cuff size");
      await expect(
        decided.getByRole("region", { name: `${text.projects_decided_not_rated} 1` }),
      ).toContainText("Comment");
      await expect(
        decided.getByRole("link", { name: fill(text.projects_decided_results, { number: 1 }) }),
      ).toBeVisible();
      await expectAxeCleanInBothThemes(page);
      await snap(page, {
        path: test.info().outputPath(`home-decide-${locale}.png`),
        fullPage: true,
      });
      await page.emulateMedia({ colorScheme: "dark" });
      await snap(page, {
        path: test.info().outputPath(`home-decide-dark-${locale}.png`),
        fullPage: true,
      });
      await page.emulateMedia({ colorScheme: "light" });

      // About this project opens below its button, with the groups and leaving.
      const about = page.getByRole("button", { name: text.projects_about_title });
      await expectHydrated(about);
      const before = await about.boundingBox();
      await about.click();
      await expect(about).toHaveAttribute("aria-expanded", "true");
      expect(await about.boundingBox()).toEqual(before);
      const panel = page.getByRole("region", { name: text.projects_about_title });
      await expect(panel.getByText("Nursing")).toBeVisible();
      await expect(
        panel.getByText(fill(text.projects_about_people_many, { count: 3 })),
      ).toBeVisible();
      await expect(panel.getByRole("button", { name: text.members_leave })).toBeVisible();
      await expectAxeClean(page);

      // The home links the scope; the scope page says where you are and leads back to the home.
      const pages = page.getByRole("navigation", { name: text.projects_home_pages_title });
      await expect(pages.getByRole("link")).toHaveText([text.scope_title, text.board_title]);
      await pages.getByRole("link", { name: text.scope_title }).click();
      await expect(page).toHaveURL((url) => url.pathname === `/projects/${seeded.projectId}/scope`);
      await expect(page.getByRole("heading", { level: 2, name: text.scope_title })).toBeVisible();
      await expect(steps(page, text).locator('[aria-current="step"]')).toContainText(
        text.projects_phase_decide,
      );
      await expect(steps(page, text).getByRole("link")).toHaveCount(0);
      expect(await leftEdges(page)).toEqual(edge);
      await expectAxeClean(page);
      await snap(page, { path: test.info().outputPath(`scope-in-decide-${locale}.png`) });
      await page.getByRole("link", { name: text.projects_back_home }).click();
      await expect(page).toHaveURL((url) => url.pathname === `/projects/${seeded.projectId}`);

      // The card starts the rating on the first element.
      await expectHydrated(start);
      await start.click();
      await expect(page).toHaveURL(
        (url) => url.pathname === `/projects/${seeded.projectId}/rounds/${seeded.round2}/rate`,
      );
      const rating = page.getByRole("region", { name: "Cuff size" });
      await expect(rating).toContainText(fill(text.rounds_card_position, { index: 1, total: 2 }));
      await expect(rating.getByText(text.rounds_rate_question)).toBeVisible();
      expect(await leftEdges(page)).toEqual(edge);
      // How the group scored opens below its row; the button stays where it is.
      const groupScores = rating.getByRole("button", {
        name: fill(text.rounds_rate_group_scores, { number: 1 }),
      });
      await expectHydrated(groupScores);
      const spot = await groupScores.boundingBox();
      await groupScores.click();
      await expect(groupScores).toHaveAttribute("aria-expanded", "true");
      expect(await groupScores.boundingBox()).toEqual(spot);
      await groupScores.click();
      await expectAxeCleanInBothThemes(page);
      await snap(page, { path: test.info().outputPath(`rating-${locale}.png`) });
      await page.emulateMedia({ colorScheme: "dark" });
      await snap(page, { path: test.info().outputPath(`rating-dark-${locale}.png`) });
      await page.emulateMedia({ colorScheme: "light" });
    });

    test("the facilitator lands on the Overview, reveals the board and moves to decide", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      const participant = await seedParticipant(db, project);
      await seedParticipant(db, project);
      await seedElement(db, await userIdOf(db, participant), project.projectId, {
        name: "Systolic",
      });
      await signInTo(page, project.facilitator.email, locale, "/projects");
      const row = page.getByRole("link", { name: /Blood pressure/ });
      await expect(row).toContainText(text.projects_row_facilitate);
      await row.click();
      await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}`);
      const tabs = page.getByRole("navigation", { name: text.projects_tabs_label });
      await expect(tabs.getByRole("link", { name: text.projects_tab_overview })).toHaveAttribute(
        "aria-current",
        "page",
      );
      // The facilitator's steps show the status only; the tabs navigate.
      await expect(steps(page, text).getByRole("link")).toHaveCount(0);
      const edge = await leftEdges(page);
      await expect(
        page.getByRole("heading", {
          name: fill(text.projects_overview_before, { phase: text.projects_phase_decide }),
        }),
      ).toBeVisible();
      await expect(
        page.getByText(
          fill(text.projects_check_contributions, { contributors: 1, participants: 2 }),
        ),
      ).toBeVisible();
      await expectAxeCleanInBothThemes(page);
      await snap(page, { path: test.info().outputPath(`overview-discover-${locale}.png`) });
      await page.emulateMedia({ colorScheme: "dark" });
      await snap(page, {
        path: test.info().outputPath(`overview-discover-dark-${locale}.png`),
      });
      await page.emulateMedia({ colorScheme: "light" });

      // Elements keeps the header in place, with its tab marked.
      await tabs.getByRole("link", { name: text.projects_tab_elements }).click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/board"));
      await expect(tabs.getByRole("link", { name: text.projects_tab_elements })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(page.getByRole("heading", { level: 2, name: text.board_title })).toBeVisible();
      expect(await leftEdges(page)).toEqual(edge);
      await snap(page, { path: test.info().outputPath(`elements-discover-${locale}.png`) });
      await tabs.getByRole("link", { name: text.projects_tab_overview }).click();
      await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}`);

      // The reveal from the checklist, after its confirmation.
      const reveal = page.getByRole("button", { name: text.board_reveal });
      await expectHydrated(reveal);
      await reveal.click();
      await page.getByRole("button", { name: text.board_reveal_confirm }).click();
      await expect(page.getByText(text.board_revealed)).toBeVisible();
      await expect(page.getByText(text.projects_check_revealed, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: text.board_reveal })).toHaveCount(0);

      // On to decide, through the confirmation below the buttons.
      const goOn = page.getByRole("button", {
        name: fill(text.projects_phase_move_next, { phase: text.projects_phase_decide }),
      });
      const before = await goOn.boundingBox();
      await goOn.click();
      await expect(
        page.getByText(
          fill(text.projects_phase_confirm_next, { phase: text.projects_phase_decide }),
        ),
      ).toBeFocused();
      expect(await goOn.boundingBox()).toEqual(before);
      await expectAxeClean(page);
      await page
        .getByRole("button", {
          name: fill(text.projects_phase_confirm, { phase: text.projects_phase_decide }),
        })
        .click();
      await expect(
        page.getByText(fill(text.projects_phase_moved, { phase: text.projects_phase_decide })),
      ).toBeVisible();
      await expect(steps(page, text).locator('[aria-current="step"]')).toContainText(
        text.projects_phase_decide,
      );
      await expect(
        page.getByText(fill(text.projects_check_round_set_up, { number: 1 })),
      ).toBeVisible();
      const phase = await db
        .selectFrom("project")
        .select("phase")
        .where("id", "=", project.projectId)
        .executeTakeFirstOrThrow();
      expect(phase.phase).toBe("decide");
    });

    test("the facilitator's Overview in decide follows the open round", async ({ page, db }) => {
      const seeded = await seedDeciding(db);
      await signInTo(page, seeded.facilitator, locale, `/projects/${seeded.projectId}`);
      await expect(
        page.getByText(
          fill(text.projects_check_round_running, { number: 2, completed: 0, raters: 3 }),
        ),
      ).toBeVisible();
      await expect(
        page.getByRole("link", { name: fill(text.projects_check_round_go, { number: 2 }) }),
      ).toBeVisible();
      await expectAxeCleanInBothThemes(page);
      await snap(page, { path: test.info().outputPath(`overview-decide-${locale}.png`) });
      await page.emulateMedia({ colorScheme: "dark" });
      await snap(page, { path: test.info().outputPath(`overview-decide-dark-${locale}.png`) });
    });
  });
}

test("a participant's discover home asks for elements and shows no decisions yet", async ({
  page,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db, "discover");
  const participant = await seedParticipant(db, project);
  await seedElement(db, await userIdOf(db, participant), project.projectId, { name: "Systolic" });
  await signInTo(page, participant, "en", `/projects/${project.projectId}`);
  const card = page.getByRole("region", { name: text.projects_home_turn_discover });
  await expect(card).toContainText(text.projects_home_fact_added);
  await expect(page.getByRole("region", { name: text.projects_decided_title })).toHaveCount(0);
  await expectAxeCleanInBothThemes(page);
  await snap(page, { path: test.info().outputPath("home-discover-en.png"), fullPage: true });
  await card.getByRole("link", { name: text.projects_task_discover_action }).click();
  await expect(page).toHaveURL(
    (url) => url.pathname === `/projects/${project.projectId}/brainstorm`,
  );
});

test.describe("on a phone", () => {
  test.use({ viewport: PHONE, locale: BROWSER_LOCALE.en });

  test("the home and the rating card scroll only down", async ({ page, db }) => {
    const seeded = await seedDeciding(db);
    await signInTo(page, seeded.nurse, "en", `/projects/${seeded.projectId}`);
    await expect(
      page.getByRole("region", { name: fill(MESSAGES.en.projects_home_turn_rate, { number: 2 }) }),
    ).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
    await snap(page, { path: test.info().outputPath("home-phone.png"), fullPage: true });
    await page.goto(`/projects/${seeded.projectId}/rounds/${seeded.round2}/rate`);
    await expect(page.getByRole("region", { name: "Cuff size" })).toBeVisible();
    expect(await scrollsSideways(page)).toBe(false);
    await snap(page, { path: test.info().outputPath("rating-phone.png"), fullPage: true });
  });
});
