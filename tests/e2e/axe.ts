// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/** The axe rule tags of WCAG 2.1 level A and AA (Q-ACC-1). */
export const WCAG_21_AA = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] as const;

/**
 * Asserts that axe finds no WCAG 2.1 A or AA violation on the page as it is now. Call it on every
 * page, in every state a spec reaches (an error shown, a dialog open), in English and Dutch.
 */
export async function expectAxeClean(page: Page): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags([...WCAG_21_AA]).analyze();
  const summary = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary, `axe violations on ${page.url()}`).toEqual([]);
}
