// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { expect, type Locator, type Page } from "@playwright/test";

/**
 * Presses Tab until `target` has focus, at most `maxPresses` times, and fails when it never gets
 * there: the keyboard-only walkthrough of Q-ACC-1.
 */
export async function tabTo(page: Page, target: Locator, maxPresses = 15): Promise<void> {
  for (let presses = 0; presses < maxPresses; presses += 1) {
    if (await target.evaluate((node) => node === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target, `Tab reaches the element within ${maxPresses} presses`).toBeFocused();
}
