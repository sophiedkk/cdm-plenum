// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Paraglide types every `m.key()` call, so a key missing from English fails tsc; a key missing
// from Dutch would fall back to English unseen (Q-I18N-1). These tests catch that, and hold the
// per-area key prefixes that keep parallel changes on separate lines (CLAUDE.md, "UI").
import { afterEach, describe, expect, it } from "vitest";
import { baseLocale, locales, overwriteGetLocale } from "@/i18n/runtime";
import { PROJECT_PHASES } from "@/lib/project-phases";
import { PROJECT_ROLES } from "@/lib/project-roles";
import { projectPhaseLabel, projectRoleLabel } from "./labels.ts";
import { loadCatalogue } from "./test-catalogue.ts";

/** The area prefixes of new keys, then the prefixes of the keys from before the rule. */
const PREFIXES = [
  "shell_",
  "projects_",
  "scope_",
  "board_",
  "rounds_",
  "members_",
  "admin_",
  "export_",
  "common_",
  "app_",
  "group_",
  "invite_",
  "mail_",
  "not_found_",
  "sign_in_",
];

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? "").sort();
}

const source = loadCatalogue(baseLocale);

afterEach(() => overwriteGetLocale(() => baseLocale));

describe("message catalogues", () => {
  it.each(locales.filter((locale) => locale !== baseLocale))(
    "%s has exactly the keys of the source locale, with the same placeholders",
    (locale) => {
      const translation = loadCatalogue(locale);
      expect(Object.keys(translation).sort()).toEqual(Object.keys(source).sort());
      for (const [key, message] of Object.entries(source)) {
        expect(placeholders(translation[key] ?? ""), key).toEqual(placeholders(message));
      }
    },
  );

  it.each(Object.keys(source))("%s starts with an area prefix", (key) => {
    expect(PREFIXES.some((prefix) => key.startsWith(prefix))).toBe(true);
  });

  it.each(locales)("%s has no em dash or spaced en dash", (locale) => {
    for (const [key, message] of Object.entries(loadCatalogue(locale))) {
      expect(message, key).not.toMatch(/—| – /);
    }
  });
});

describe("labels", () => {
  it("name every project role and phase in both languages", () => {
    for (const locale of locales) {
      overwriteGetLocale(() => locale);
      for (const role of PROJECT_ROLES) expect(projectRoleLabel(role)).not.toBe("");
      for (const phase of PROJECT_PHASES) expect(projectPhaseLabel(phase)).not.toBe("");
    }
    overwriteGetLocale(() => "nl");
    expect(projectPhaseLabel("handoff")).toBe("Overdracht");
  });
});
