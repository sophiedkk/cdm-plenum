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
  // A toast or dialog that is still fading in fails the contrast rule; a spinner never ends.
  await page.waitForFunction(() =>
    document
      .getAnimations()
      .every(
        (animation) =>
          animation.playState !== "running" ||
          animation.effect?.getTiming().iterations === Number.POSITIVE_INFINITY,
      ),
  );
  const results = await new AxeBuilder({ page }).withTags([...WCAG_21_AA]).analyze();
  const summary = results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    help: violation.help,
    targets: violation.nodes.map((node) => node.target.join(" ")),
  }));
  expect(summary, `axe violations on ${page.url()}`).toEqual([]);
}

/**
 * Waits until every toast has finished its entry animation, then runs `expectAxeClean`: Sonner
 * fades toasts in, and axe would otherwise measure the contrast of a half-faded toast.
 */
export async function expectAxeCleanAfterToasts(page: Page): Promise<void> {
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
 * Runs `expectAxeClean` with the light theme and with the dark one, through the browser's colour
 * scheme. The page must follow the system setting, which it does without a stored choice.
 */
export async function expectAxeCleanInBothThemes(page: Page): Promise<void> {
  for (const scheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator("html")).toHaveAttribute("data-theme", scheme);
    // Buttons fade their colours to the new theme; axe would measure them halfway.
    await page.waitForFunction(() =>
      document.getAnimations().every((animation) => animation.playState !== "running"),
    );
    await expectAxeClean(page);
  }
  await page.emulateMedia({ colorScheme: "light" });
}
