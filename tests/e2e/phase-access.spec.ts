// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Phase-bound access (PR9, PR10, PR11, ADR 0019): a participant reaches only the steps the
// current phase opens, from the project home (the phase steps of the header link nowhere), reads
// earlier steps without their forms, and lands on the project home from a hidden step's URL; the
// facilitator sees the same
// fixed tabs in every phase and gets a refusal when opening a round outside the decide phase.
// The read-only scope is axe-clean in English and Dutch (Q-ACC-1, Q-I18N-1).
import type { Page } from "@playwright/test";
import { PROJECT_PHASES, type ProjectPhase } from "../../src/lib/project-phases.ts";
import { createRound } from "../../src/server/rounds/queries.ts";
import { addScopeComment } from "../../src/server/scope/queries.ts";
import { insertElement, setPhase } from "../../src/server/test-fixtures.ts";
import { seedReveal, signInTo } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedParticipant,
  seedProject,
  test,
} from "./fixtures.ts";

const PHASE_NAMES: Record<ProjectPhase, string> = {
  scope: MESSAGES.en.projects_phase_scope,
  discover: MESSAGES.en.projects_phase_discover,
  decide: MESSAGES.en.projects_phase_decide,
  detail: MESSAGES.en.projects_phase_detail,
  handoff: MESSAGES.en.projects_phase_handoff,
};

/** The names of the project tabs, in order. */
async function tabNames(page: Page, locale: Locale): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: MESSAGES[locale].projects_tabs_label });
  await expect(nav).toBeVisible();
  return nav.getByRole("link").allTextContents();
}

/**
 * The pages a participant's home links to besides the task, by their text. A participant has no
 * tabs; the current phase step links to the home and a done step to its recap (PR13).
 */
async function homeLinks(page: Page, locale: Locale): Promise<string[]> {
  const text = MESSAGES[locale];
  await expect(
    page.getByRole("navigation", { name: text.projects_tabs_label, exact: true }),
  ).toHaveCount(0);
  const steps = page.getByRole("list", { name: text.projects_steps_label });
  await expect(steps).toBeVisible();
  const current = steps.locator('[aria-current="step"]').getByRole("link");
  await expect(current).toHaveAttribute("href", /^\/projects\/[^/]+$/);
  const own = await current.getAttribute("href");
  for (const href of await steps
    .getByRole("link")
    .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? ""))) {
    if (href !== own) expect(href).toMatch(/\/recap\/(scope|discover|decide|detail)$/);
  }
  const pages = page.getByRole("navigation", { name: text.projects_home_pages_title });
  if ((await pages.count()) === 0) return [];
  return pages.getByRole("link").allTextContents();
}

test("a participant in the scope phase reaches the scope only, and comments", async ({
  page,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db, "scope");
  const participant = await seedParticipant(db, project);
  await signInTo(page, participant, "en", `/projects/${project.projectId}`);
  // The scope is the task: "Your turn" leads there, and the home links nothing else.
  await expect(
    page.getByRole("heading", { level: 2, name: text.projects_home_turn_scope }),
  ).toBeVisible();
  expect(await homeLinks(page, "en")).toEqual([]);
  await page.getByRole("link", { name: text.projects_task_scope_action }).click();
  await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}/scope`);
  const field = page.getByLabel(text.common_comment_label);
  await expectHydrated(field);
  await field.fill("Do home readings count?");
  await page.getByRole("button", { name: text.common_comment_submit }).click();
  await expect(page.getByRole("list", { name: text.scope_comments_heading })).toContainText(
    "Do home readings count?",
  );
  await expect(page.getByTestId("step-closed-note")).toHaveCount(0);
  await expectAxeClean(page);
});

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`a participant in the discover phase, in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("sees the brainstorm and the board, and reads the scope without a comment form", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      const participant = await seedParticipant(db, project);
      const comment = await addScopeComment(db, project.facilitator.userId, {
        projectId: project.projectId,
        body: "Agreed in the scope phase.",
      });
      expect(comment.ok).toBe(true);
      await signInTo(page, participant, locale, `/projects/${project.projectId}`);
      // The scope and the elements open from the home; the brainstorm is the task (PR8, PR11).
      expect(await homeLinks(page, locale)).toEqual([text.scope_title, text.board_title]);
      await page
        .getByRole("navigation", { name: text.projects_home_pages_title })
        .getByRole("link", { name: text.scope_title })
        .click();
      await expect(page).toHaveURL(
        (url) => url.pathname === `/projects/${project.projectId}/scope`,
      );
      await expect(page.getByRole("heading", { level: 2, name: text.scope_title })).toBeVisible();
      await expect(page.getByRole("link", { name: text.projects_back_task })).toHaveAttribute(
        "href",
        `/projects/${project.projectId}`,
      );
      await expect(page.getByRole("list", { name: text.scope_comments_heading })).toContainText(
        "Agreed in the scope phase.",
      );
      await expect(page.getByTestId("step-closed-note")).toHaveText(text.common_step_closed);
      await expect(page.getByLabel(text.common_comment_label)).toHaveCount(0);
      await expect(page.getByRole("button", { name: text.common_comment_submit })).toHaveCount(0);
      await expectAxeClean(page);
    });
  });
}

test("a participant in the decide phase reads the board without the add button or a comment form", async ({
  page,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db, "discover");
  const participant = await seedParticipant(db, project);
  await insertElement(db, project.projectId, "Systolic pressure");
  await seedReveal(db, project.facilitator.userId, project.projectId);
  await setPhase(db, project.projectId, "decide");
  await signInTo(page, participant, "en", `/projects/${project.projectId}/board`);
  await expect(page.getByRole("heading", { level: 2, name: text.board_title })).toBeVisible();
  await expect(page.getByRole("button", { name: text.board_add })).toHaveCount(0);
  await expect(page.getByTestId("step-closed-note").first()).toBeVisible();
  const toggle = page.getByRole("button", { name: "Systolic pressure" });
  await expectHydrated(toggle);
  await toggle.click();
  const details = page.getByRole("region", { name: /Systolic pressure/ }).first();
  await expect(details.getByTestId("step-closed-note")).toBeVisible();
  await expect(details.getByLabel(text.common_comment_label)).toHaveCount(0);
  await expectAxeClean(page);
});

test("a participant opening the rounds URL in the discover phase lands on their task", async ({
  page,
  db,
}) => {
  const project = await seedProject(db, "discover");
  const participant = await seedParticipant(db, project);
  await signInTo(page, participant, "en", `/projects/${project.projectId}/rounds`);
  await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}`);
  await expect(
    page.getByRole("region", { name: MESSAGES.en.projects_home_turn_discover }),
  ).toBeVisible();
});

test("the facilitator sees the same tabs in the same order in every phase (ADR 0019)", async ({
  page,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db, "scope");
  const projectUrl = `/projects/${project.projectId}`;
  const tabs = [
    text.projects_tab_overview,
    text.projects_tab_scope,
    text.projects_tab_elements,
    text.projects_tab_rounds,
    text.projects_tab_details,
  ];
  await signInTo(page, project.facilitator.email, "en", projectUrl);
  for (const phase of PROJECT_PHASES) {
    await setPhase(db, project.projectId, phase);
    await page.goto(projectUrl);
    await expect(page.locator('[aria-current="step"]')).toContainText(PHASE_NAMES[phase]);
    expect(await tabNames(page, "en")).toEqual(tabs);
    // People and Settings sit in the Project menu, the last item of the tab row.
    await expect(
      page
        .getByRole("navigation", { name: text.projects_tabs_label })
        .getByRole("button", { name: text.projects_tab_project }),
    ).toBeVisible();
    // The project opens on the Overview in every phase.
    await expect(
      page
        .getByRole("navigation", { name: text.projects_tabs_label })
        .getByRole("link", { name: text.projects_tab_overview }),
    ).toHaveAttribute("aria-current", "page");
  }
});

test("the facilitator sets up a round in the discover phase but cannot open it", async ({
  page,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db, "discover");
  await seedParticipant(db, project);
  await insertElement(db, project.projectId, "Systolic pressure");
  const created = await createRound(
    db,
    project.facilitator.userId,
    { projectId: project.projectId, closesAt: new Date(Date.now() + 86_400_000) },
    { now: new Date() },
  );
  if (!created.ok) throw new Error(`createRound refused: ${created.error}`);
  await signInTo(
    page,
    project.facilitator.email,
    "en",
    `/projects/${project.projectId}/rounds/${created.value.roundId}`,
  );
  // The facilitator prepared the round, but outside decide the page offers no button to open it;
  // the server refuses it too (round_outside_decide, phase-access.test.ts).
  await expect(page.getByText(text.rounds_open_in_decide)).toBeVisible();
  await expect(page.getByRole("button", { name: text.rounds_open_button })).toHaveCount(0);
  await expectAxeClean(page);
  const round = await db
    .selectFrom("round")
    .select("opened_at")
    .where("id", "=", created.value.roundId)
    .executeTakeFirstOrThrow();
  expect(round.opened_at).toBeNull();
});
