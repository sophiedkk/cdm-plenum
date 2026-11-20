// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Phase-bound access (PR9, PR10, PR11): a participant sees only the steps of the current phase,
// the work of the phase first, reads earlier steps without their forms, and lands on the current
// step from a hidden step's URL; the facilitator sees every step and gets a refusal when opening
// a round outside the decide phase.
// The read-only scope is axe-clean in English and Dutch (Q-ACC-1, Q-I18N-1).
import type { Page } from "@playwright/test";
import { STEP_ORDER } from "../../src/lib/phase-access.ts";
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
  handoff: MESSAGES.en.projects_phase_handoff,
};

/** The names of the project tabs, in order. */
async function tabNames(page: Page, locale: Locale): Promise<string[]> {
  const nav = page.getByRole("navigation", { name: MESSAGES[locale].projects_tabs_label });
  await expect(nav).toBeVisible();
  return nav.getByRole("link").allTextContents();
}

test("a participant in the scope phase sees the scope and members, and comments", async ({
  page,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db, "scope");
  const participant = await seedParticipant(db, project);
  await signInTo(page, participant, "en", `/projects/${project.projectId}/scope`);
  expect(await tabNames(page, "en")).toEqual([text.projects_tab_scope, text.projects_tab_members]);
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
      await signInTo(page, participant, locale, `/projects/${project.projectId}/scope`);
      // The work of the discover phase comes first (PR11).
      expect(await tabNames(page, locale)).toEqual([
        text.projects_tab_brainstorm,
        text.projects_tab_board,
        text.projects_tab_scope,
        text.projects_tab_members,
      ]);
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

test("a participant opening the rounds URL in the discover phase lands on their current step", async ({
  page,
  db,
}) => {
  const project = await seedProject(db, "discover");
  const participant = await seedParticipant(db, project);
  await signInTo(page, participant, "en", `/projects/${project.projectId}/rounds`);
  await expect(page).toHaveURL(
    (url) => url.pathname === `/projects/${project.projectId}/brainstorm`,
  );
  await expect(page.getByRole("region", { name: MESSAGES.en.projects_task_heading })).toBeVisible();
});

test("the facilitator sees every tab in every phase, the work of the phase first", async ({
  page,
  db,
}) => {
  const text = MESSAGES.en;
  const project = await seedProject(db, "scope");
  const projectUrl = `/projects/${project.projectId}`;
  const tabs: Record<string, string> = {
    scope: text.projects_tab_scope,
    brainstorm: text.projects_tab_brainstorm,
    board: text.projects_tab_board,
    rounds: text.projects_tab_rounds,
    export: text.projects_tab_export,
    members: text.projects_tab_members,
    settings: text.projects_tab_settings,
  };
  await signInTo(page, project.facilitator.email, "en", projectUrl);
  for (const phase of PROJECT_PHASES) {
    await setPhase(db, project.projectId, phase);
    await page.goto(projectUrl);
    await expect(page.locator('[aria-current="step"]')).toContainText(PHASE_NAMES[phase]);
    expect(await tabNames(page, "en")).toEqual(STEP_ORDER[phase].map((step) => tabs[step]));
    expect((await tabNames(page, "en")).slice(-2)).toEqual([
      text.projects_tab_members,
      text.projects_tab_settings,
    ]);
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
