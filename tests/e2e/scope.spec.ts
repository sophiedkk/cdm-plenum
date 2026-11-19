// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The scope page (SC1, SC2): the facilitator edits the statement and orders the sources with
// the keyboard only; a participant reads it and comments without being named to others
// (Q-ANON-1); axe-clean in English and Dutch (Q-ACC-1, Q-I18N-1).
import { addScopeComment } from "../../src/server/scope/queries.ts";
import { seedScope, signInTo, userIdOf } from "./board-seed.ts";
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
import { tabTo } from "./keyboard.ts";

/** Fills the `{name}` placeholders of a catalogue text. */
function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`scope page in ${locale}`, () => {
    // Sonner fades toasts in; axe would measure the contrast of a half-faded toast.
    test.use({ locale: BROWSER_LOCALE[locale], reducedMotion: "reduce" });
    const text = MESSAGES[locale];

    test("the facilitator edits the scope and sorts the sources with the keyboard", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db);
      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/scope`,
      );
      await expect(page.getByRole("heading", { level: 2, name: text.scope_title })).toBeVisible();
      await expect(page.getByText(text.scope_not_written).first()).toBeVisible();
      await expectAxeClean(page);

      const edit = page.getByRole("button", { name: text.scope_edit });
      await expectHydrated(edit);
      await tabTo(page, edit, 30);
      await page.keyboard.press("Enter");
      await expect(page.getByLabel(text.scope_concept, { exact: true })).toBeFocused();
      await page.keyboard.type("Blood pressure measured in the clinic and at home.");
      await expectAxeClean(page);
      await tabTo(page, page.getByRole("button", { name: text.scope_save }), 10);
      await page.keyboard.press("Enter");
      await expect(
        page.getByText("Blood pressure measured in the clinic and at home."),
      ).toBeVisible();
      await expect(edit).toBeFocused();

      const sources = page.getByRole("region", { name: text.scope_sources_heading });
      for (const [label, url] of [
        ["ESC guideline", "https://example.test/esc"],
        ["Ward form", ""],
      ] as const) {
        const title = page.getByLabel(text.scope_source_label_label);
        await tabTo(page, title, 40);
        await page.keyboard.type(label);
        if (url) {
          await page.keyboard.press("Tab");
          await page.keyboard.type(url);
        }
        await page.keyboard.press("Enter");
        await expect(sources.getByRole("listitem").filter({ hasText: label })).toBeVisible();
      }
      const link = page.getByRole("link", { name: /ESC guideline/ });
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await expect(link).toHaveAttribute("target", "_blank");

      const moveUp = page.getByRole("button", {
        name: fill(text.scope_source_move_up, { label: "Ward form" }),
      });
      // The buttons sit above the form that has the focus, so go back with Shift+Tab.
      for (let presses = 0; presses < 10; presses += 1) {
        if (await moveUp.evaluate((node) => node === document.activeElement)) break;
        await page.keyboard.press("Shift+Tab");
      }
      await expect(moveUp).toBeFocused();
      await page.keyboard.press("Enter");
      const items = sources.getByRole("listitem");
      await expect(items.first()).toContainText("Ward form");
      await expect(items.nth(1)).toContainText("ESC guideline");
      // The moved source keeps the focus, on the button that still works.
      await expect(
        page.getByRole("button", {
          name: fill(text.scope_source_move_down, { label: "Ward form" }),
        }),
      ).toBeFocused();
      await expectAxeClean(page);
    });

    test("a participant reads the scope and comments; only the facilitator sees who", async ({
      page,
      db,
      browser,
    }) => {
      const project = await seedProject(db);
      const participant = await seedParticipant(db, project);
      await seedScope(db, project.facilitator.userId, project.projectId, {
        concept: "Office blood pressure.",
        useCases: "Hypertension follow-up.",
        outOfScope: "Ambulatory monitoring.",
      });
      await signInTo(page, participant, locale, `/projects/${project.projectId}/scope`);
      await expect(page.getByText("Hypertension follow-up.")).toBeVisible();
      await expect(page.getByRole("button", { name: text.scope_edit })).toHaveCount(0);
      await expect(page.getByLabel(text.scope_source_label_label)).toHaveCount(0);
      await expectAxeClean(page);

      const field = page.getByLabel(text.common_comment_label);
      await expectHydrated(field);
      await tabTo(page, field, 40);
      await page.keyboard.type("Home readings belong in scope.");
      await page.keyboard.press("Tab");
      await page.keyboard.press("Enter");
      const list = page.getByRole("list", { name: text.scope_comments_heading });
      await expect(list).toContainText("Home readings belong in scope.");
      await expect(list).not.toContainText(participant);
      await expectAxeClean(page);

      const facilitator = await browser.newPage({ locale: BROWSER_LOCALE[locale] });
      await signInTo(
        facilitator,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/scope`,
      );
      await expect(
        facilitator.getByRole("list", { name: text.scope_comments_heading }),
      ).toContainText(participant);
      await facilitator.close();
    });
  });
}

test("no response to a participant on the scope page names another member", async ({
  page,
  db,
}) => {
  const project = await seedProject(db);
  const participant = await seedParticipant(db, project);
  const other = await seedParticipant(db, project);
  // A comment by the other participant, so a leaking author would show up.
  const seeded = await addScopeComment(db, await userIdOf(db, other), {
    projectId: project.projectId,
    body: "Seeded comment.",
  });
  expect(seeded.ok).toBe(true);
  const bodies: string[] = [];
  page.on("response", async (response) => {
    if (response.url().includes("_serverFn")) bodies.push(await response.text().catch(() => ""));
  });
  await signInTo(page, participant, "en", `/projects/${project.projectId}/scope`);
  await page.getByLabel(MESSAGES.en.common_comment_label).fill("A comment.");
  await page.getByRole("button", { name: MESSAGES.en.common_comment_submit }).click();
  await expect(page.getByText("A comment.")).toBeVisible();
  const html = await page.content();
  for (const text of [...bodies, html]) {
    expect(text).not.toContain(other);
    expect(text).not.toContain(project.facilitator.email);
  }
});
