// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project mode (PR14, ADR 0023) in English and Dutch: the facilitator chooses Delphi study or
// Team when creating a project and can change it until a round opens; in a Team project a
// participant sees by name who added an element and who wrote a comment, in a Delphi project still
// nobody (Q-ANON-1). Every page is axe-clean (Q-ACC-1, Q-I18N-1).
import { addElementComment } from "../../src/server/elements/queries.ts";
import { addScopeComment } from "../../src/server/scope/queries.ts";
import { seedElement, seedReveal, signInTo, userIdOf } from "./board-seed.ts";
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
  uniqueName,
} from "./fixtures.ts";

const AUTHOR = "Invented Author";

/** Fills the `{name}` placeholders of a catalogue text. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`project mode in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce" });
    const text = MESSAGES[locale];

    test("the facilitator creates a Team project and switches the mode until a round opens", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      await signInTo(page, project.facilitator.email, locale, "/projects/new");
      const name = uniqueName("Team project");
      await expectHydrated(page.getByLabel(text.projects_name_label));
      const delphi = page.getByRole("radio", { name: new RegExp(text.projects_mode_delphi) });
      await expect(delphi).toBeChecked();
      await expectAxeClean(page);
      await page.getByLabel(text.projects_name_label).fill(name);
      await page.getByRole("radio", { name: new RegExp(`^${text.projects_mode_team}`) }).click();
      await page.getByRole("button", { name: text.projects_create }).click();
      await expect(page).toHaveURL(/\/projects\/[^/]+\/scope$/);
      const created = await db
        .selectFrom("project")
        .innerJoin("organization", "organization.id", "project.id")
        .select(["project.id", "project.mode"])
        .where("organization.name", "=", name)
        .executeTakeFirstOrThrow();
      expect(created.mode).toBe("team");

      // Settings: the facilitator switches back and forth, which saves on change.
      await page.goto(`/projects/${created.id}/settings`);
      const heading = page.getByRole("heading", { name: text.projects_mode_heading });
      await expect(heading).toBeVisible();
      const teamRadio = page.getByRole("radio", {
        name: new RegExp(`^${text.projects_mode_team}`),
      });
      await expect(teamRadio).toBeChecked();
      const delphiRadio = page.getByRole("radio", {
        name: new RegExp(`^${text.projects_mode_delphi}`),
      });
      await expectHydrated(delphiRadio);
      await delphiRadio.click();
      await expect(page.getByRole("status").filter({ hasText: text.common_saved })).toBeVisible();
      await expect
        .poll(async () => {
          const row = await db
            .selectFrom("project")
            .select("mode")
            .where("id", "=", created.id)
            .executeTakeFirstOrThrow();
          return row.mode;
        })
        .toBe("delphi");
      await expectAxeClean(page);

      // After a round has opened the setting reads as text with one line why.
      await db
        .insertInto("round")
        .values({
          project_id: created.id,
          number: 1,
          closes_at: new Date(Date.now() + 86_400_000),
          opened_at: new Date(),
          panel_clinical: 0,
          minimum_clinical: 0,
          panel_terminology: 0,
          minimum_terminology: 0,
          panel_architecture: 0,
          minimum_architecture: 0,
        })
        .execute();
      await page.reload();
      await expect(page.getByRole("heading", { name: text.projects_mode_heading })).toBeVisible();
      await expect(page.getByTestId("project-mode-locked")).toContainText(
        text.projects_mode_locked,
      );
      await expect(
        page.getByRole("radio", { name: new RegExp(text.projects_mode_team) }),
      ).toHaveCount(0);
      await expectAxeClean(page);
    });

    test("in a Team project a participant sees who added an element and who commented", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      await db
        .updateTable("project")
        .set({ mode: "team" })
        .where("id", "=", project.projectId)
        .execute();
      const reader = await seedParticipant(db, project);
      const writer = await seedParticipant(db, project);
      const writerId = await userIdOf(db, writer);
      await db.updateTable("user").set({ name: AUTHOR }).where("id", "=", writerId).execute();
      const elementId = await seedElement(db, writerId, project.projectId, {
        name: "Cuff size",
        description: "The width of the cuff.",
      });
      const commented = await addElementComment(db, writerId, {
        projectId: project.projectId,
        elementId,
        body: "Measure the upper arm.",
      });
      if (!commented.ok) throw new Error(commented.error);
      await seedReveal(db, project.facilitator.userId, project.projectId);

      await signInTo(page, reader, locale, `/projects/${project.projectId}/board`);
      const toggle = page.getByRole("button", { name: "Cuff size", exact: true });
      await expectHydrated(toggle);
      await toggle.click();
      const details = page.getByRole("region", {
        name: fill(text.board_details_label, { name: "Cuff size" }),
      });
      await expect(details.getByText(text.board_field_author)).toBeVisible();
      await expect(details).toContainText(AUTHOR);
      await expect(details).toContainText(fill(text.common_comment_author, { name: AUTHOR }));
      expect(await page.content()).not.toContain(writer);
      await expectAxeClean(page);

      // The home says in one line how the project runs.
      await page.goto(`/projects/${project.projectId}`);
      const about = page.getByRole("button", { name: text.projects_about_title });
      await expectHydrated(about);
      await about.click();
      await expect(page.getByTestId("about-mode")).toHaveText(text.projects_about_mode_team);
      await expectAxeClean(page);
    });

    test("in a Team project a participant sees who wrote a scope comment", async ({ page, db }) => {
      const project = await seedProject(db, "scope");
      await db
        .updateTable("project")
        .set({ mode: "team" })
        .where("id", "=", project.projectId)
        .execute();
      const reader = await seedParticipant(db, project);
      const writerId = await userIdOf(db, await seedParticipant(db, project));
      await db.updateTable("user").set({ name: AUTHOR }).where("id", "=", writerId).execute();
      const commented = await addScopeComment(db, writerId, {
        projectId: project.projectId,
        body: "Include home measurements.",
      });
      if (!commented.ok) throw new Error(commented.error);
      await signInTo(page, reader, locale, `/projects/${project.projectId}/scope`);
      await expect(page.getByText("Include home measurements.")).toBeVisible();
      await expect(
        page.getByText(fill(text.common_comment_author, { name: AUTHOR })),
      ).toBeVisible();
      await expectAxeClean(page);
    });

    test("in a Delphi project a participant still sees nobody's name", async ({ page, db }) => {
      const project = await seedProject(db, "discover");
      const reader = await seedParticipant(db, project);
      const writerId = await userIdOf(db, await seedParticipant(db, project));
      await db.updateTable("user").set({ name: AUTHOR }).where("id", "=", writerId).execute();
      const elementId = await seedElement(db, writerId, project.projectId, { name: "Cuff size" });
      const commented = await addElementComment(db, writerId, {
        projectId: project.projectId,
        elementId,
        body: "Measure the upper arm.",
      });
      if (!commented.ok) throw new Error(commented.error);
      await seedReveal(db, project.facilitator.userId, project.projectId);

      await signInTo(page, reader, locale, `/projects/${project.projectId}/board`);
      const toggle = page.getByRole("button", { name: "Cuff size", exact: true });
      await expectHydrated(toggle);
      await toggle.click();
      const details = page.getByRole("region", {
        name: fill(text.board_details_label, { name: "Cuff size" }),
      });
      await expect(details).toContainText("Measure the upper arm.");
      await expect(details.getByText(text.board_field_author)).toHaveCount(0);
      expect(await page.content()).not.toContain(AUTHOR);
      await expectAxeClean(page);

      await page.goto(`/projects/${project.projectId}`);
      const about = page.getByRole("button", { name: text.projects_about_title });
      await expectHydrated(about);
      await about.click();
      await expect(page.getByTestId("about-mode")).toHaveText(text.projects_about_mode_delphi);
    });
  });
}
