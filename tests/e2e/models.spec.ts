// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import type { Kysely } from "kysely";
import type { DB } from "../../src/server/db/schema.gen.ts";
import type { FhirClient, FhirResult } from "../../src/server/fhir/client.ts";
import { type FhirStructure, parseStructureDefinition } from "../../src/server/fhir/parse.ts";
import { fhirFixtureJson } from "../../src/server/fhir/test-package.ts";
import { addFhirSource, suggestSource } from "../../src/server/sources/queries.ts";
// Existing models in English and Dutch (EL7, EL12, EL20, ADR 0020): the facilitator opens the page
// from the Overview's first item, adds an archetype from the CKM stub, unchecks one row of the
// coverage table and puts the rest on the list, and accepts a participant's suggestion. With two
// FHIR profiles of the synthetic package, "Not the same" splits a suggested match, and the
// facilitator marks one profile as the base model (EL25): its column moves first and the rows it
// lacks say "Not in the base". A participant never reaches the page. Every state is axe-clean (Q-ACC-1, Q-I18N-1).
import { signInTo, userIdOf } from "./board-seed.ts";
import {
  BROWSER_LOCALE,
  expect,
  expectAxeClean,
  expectAxeCleanAfterToasts,
  expectAxeCleanInBothThemes,
  expectHydrated,
  type Locale,
  MESSAGES,
  seedParticipant,
  seedProject,
  test,
} from "./fixtures.ts";

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key]));
}

const FHIR_PACKAGE = "example.fhir.bp";
const FHIR_VERSION = "1.0.0";
const FHIR_PROFILES = {
  "http://example.org/fhir/StructureDefinition/example-BloodPressure":
    "StructureDefinition-example-BloodPressure.json",
  "http://example.org/fhir/StructureDefinition/BloodPressureModel":
    "StructureDefinition-BloodPressureModel.json",
} as const;

/** Adds the two FHIR profiles to the project; returns their titles in the order added. */
async function addBothProfiles(db: Kysely<DB>, projectId: string, facilitator: string) {
  const titles: string[] = [];
  for (const url of Object.keys(FHIR_PROFILES)) {
    const added = await addFhirSource(db, fixtureFhir as FhirClient, facilitator, {
      projectId,
      packageName: FHIR_PACKAGE,
      version: FHIR_VERSION,
      url,
    });
    if (!added.ok) throw new Error(added.error);
    const row = await db
      .selectFrom("source_model")
      .select("title")
      .where("id", "=", added.value.sourceModelId)
      .executeTakeFirstOrThrow();
    titles.push(row.title);
  }
  return titles;
}

/** Serves the two profiles of the synthetic package, so no spec calls the registry. */
const fixtureFhir: Pick<FhirClient, "structureDefinition"> = {
  async structureDefinition(_name, _version, url): Promise<FhirResult<FhirStructure>> {
    const file = FHIR_PROFILES[url as keyof typeof FHIR_PROFILES];
    const parsed = parseStructureDefinition(fhirFixtureJson(`package/${file}`));
    if (!parsed.ok) throw new Error("fixture did not parse");
    return { kind: "ok", value: parsed.value };
  },
};

for (const locale of ["en", "nl"] as const satisfies Locale[]) {
  test.describe(`existing models in ${locale}`, () => {
    test.use({ locale: BROWSER_LOCALE[locale] });
    const text = MESSAGES[locale];

    test("the facilitator adds an archetype and puts its elements on the list", async ({
      page,
      db,
    }) => {
      const project = await seedProject(db, "discover");
      const participant = await seedParticipant(db, project);
      const suggested = await suggestSource(db, await userIdOf(db, participant), {
        projectId: project.projectId,
        title: "Ward pulse chart",
        link: "https://forms.example.test/pulse",
      });
      if (!suggested.ok) throw new Error(suggested.error);

      await signInTo(page, project.facilitator.email, locale, `/projects/${project.projectId}`);
      const start = page.getByRole("link", { name: text.projects_check_models_start });
      await expectHydrated(start);
      await start.click();
      await expect(page).toHaveURL((url) => url.pathname.endsWith("/models"));
      await expect(
        page.getByRole("heading", { level: 2, name: text.board_models_title }),
      ).toBeVisible();
      await expect(page.getByText("Ward pulse chart")).toBeVisible();
      await expectAxeCleanInBothThemes(page);

      // Add the blood pressure archetype from the CKM stub.
      const add = page.getByRole("button", { name: text.board_models_add_title });
      await expectHydrated(add);
      await add.click();
      const dialog = page.getByRole("dialog", { name: text.board_models_add_title });
      await dialog.getByLabel(text.board_models_search_ckm).fill("blood pressure");
      await dialog.getByRole("button", { name: text.board_models_search }).click();
      await expect(dialog.getByText("openEHR-EHR-OBSERVATION.blood_pressure.v2")).toBeVisible();
      await expectAxeClean(page);
      await dialog
        .getByRole("button", {
          name: fill(text.board_models_add_named, { name: "Blood pressure" }),
        })
        .click();
      await expect(dialog).toBeHidden();
      await expect(page.getByText(text.board_models_added)).toBeVisible();
      const table = page.getByRole("table", { name: text.board_models_coverage_title });
      await expect(table).toBeVisible();
      const rows = await table.getByRole("checkbox").count();
      expect(rows).toBeGreaterThan(5);
      await expectAxeCleanAfterToasts(page);

      // Leave one element out, put the rest on the list.
      await table.getByRole("checkbox", { name: "Comment", exact: true }).click();
      await expect(
        page.getByText(fill(text.board_models_chosen, { chosen: rows - 1, total: rows })),
      ).toBeVisible();
      await page.getByRole("button", { name: text.board_models_put_on_list }).click();
      await expect(
        page.getByText(fill(text.board_models_listed_many, { count: rows - 1 })),
      ).toBeVisible();
      await expect(
        page.getByText(fill(text.board_models_chosen, { chosen: 1, total: 1 })),
      ).toBeVisible();
      await expect(table.getByRole("checkbox", { name: "Comment", exact: true })).toBeEnabled();
      await expect(table.getByRole("checkbox", { disabled: true })).toHaveCount(rows - 1);
      const listed = await db
        .selectFrom("element")
        .select("name")
        .where("project_id", "=", project.projectId)
        .execute();
      expect(listed).toHaveLength(rows - 1);

      // Accept the participant's suggestion.
      await page
        .getByRole("button", {
          name: fill(text.board_models_accept_named, { title: "Ward pulse chart" }),
        })
        .click();
      await expect(
        page.getByText(fill(text.board_models_accepted, { title: "Ward pulse chart" })),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: text.board_models_suggestions_title }),
      ).toHaveCount(0);
      await expectAxeCleanAfterToasts(page);

      // The Overview's first item is done.
      await page
        .getByRole("navigation", { name: text.projects_tabs_label })
        .getByRole("link", { name: text.projects_tab_overview })
        .click();
      await expect(
        page.getByRole("link", { name: text.projects_check_models_review }),
      ).toBeVisible();
    });

    test("the facilitator splits a suggested match with Not the same", async ({ page, db }) => {
      const project = await seedProject(db, "discover");
      await addBothProfiles(db, project.projectId, project.facilitator.userId);

      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/models`,
      );
      const table = page.getByRole("table", { name: text.board_models_coverage_title });
      const notSame = table.getByRole("button", {
        name: new RegExp(`^${text.board_models_not_same}: `),
      });
      await expectHydrated(notSame.first());
      const rows = await table.getByRole("checkbox").count();
      const suggestions = await notSame.count();
      expect(suggestions).toBeGreaterThan(0);
      await expectAxeClean(page);

      await notSame.first().click();
      await expect(page.getByText(text.board_models_not_same_done)).toBeVisible();
      await expect(table.getByRole("checkbox")).toHaveCount(rows + 1);
      await expect(notSame).toHaveCount(suggestions - 1);
      await expectAxeCleanAfterToasts(page);
    });

    test("the facilitator marks a base model and unmarks it (EL25)", async ({ page, db }) => {
      const project = await seedProject(db, "discover");
      const [first, second] = await addBothProfiles(
        db,
        project.projectId,
        project.facilitator.userId,
      );
      if (!first || !second) throw new Error("two profiles expected");

      await signInTo(
        page,
        project.facilitator.email,
        locale,
        `/projects/${project.projectId}/models`,
      );
      const table = page.getByRole("table", { name: text.board_models_coverage_title });
      const columns = table.getByRole("columnheader");
      const markSecond = table.getByRole("button", {
        name: fill(text.board_models_base_named, { title: second }),
      });
      await expectHydrated(markSecond);
      await expect(markSecond).toHaveAttribute("aria-pressed", "false");
      await expect(columns.nth(2)).toContainText(first);
      await expect(table.getByText(text.board_models_not_in_base)).toHaveCount(0);

      await markSecond.click();
      await expect(
        page.getByText(fill(text.board_models_base_set, { title: second })),
      ).toBeVisible();
      await expect(markSecond).toHaveAttribute("aria-pressed", "true");
      await expect(columns.nth(2)).toContainText(second);
      await expect(columns.nth(3)).toContainText(first);
      await expect(table.getByText(text.board_models_not_in_base).first()).toBeVisible();
      await expectAxeCleanAfterToasts(page);

      await markSecond.click();
      await expect(
        page.getByText(fill(text.board_models_base_cleared, { title: second })),
      ).toBeVisible();
      await expect(markSecond).toHaveAttribute("aria-pressed", "false");
      await expect(columns.nth(2)).toContainText(first);
      await expect(table.getByText(text.board_models_not_in_base)).toHaveCount(0);
    });
  });
}

test("a participant is sent from the models page to the project home", async ({ page, db }) => {
  const project = await seedProject(db, "discover");
  const participant = await seedParticipant(db, project);
  await signInTo(page, participant, "en", `/projects/${project.projectId}/models`);
  await expect(page).toHaveURL((url) => url.pathname === `/projects/${project.projectId}`);
});
