// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useRouter } from "@tanstack/react-router";
import { useEffect } from "react";
import { MAIN_CONTENT_ID } from "./skip-link";

const PROJECT_INDEX = /^\/projects\/[^/]+\/?$/;

/** The elements that name the page, best first: the project name on a project's home, else the page's h2. */
export function pageHeadingSelectors(pathname: string): string[] {
  const main = `#${MAIN_CONTENT_ID}`;
  return PROJECT_INDEX.test(pathname) ? [`${main} h1`, `${main} h2`] : [`${main} h2`, `${main} h1`];
}

function moveFocus(pathname: string) {
  const active = document.activeElement;
  // A page that placed focus itself, such as the rating card on its heading, keeps it.
  if (
    active instanceof HTMLElement &&
    /^H[1-6]$/.test(active.tagName) &&
    active.closest(`#${MAIN_CONTENT_ID}`)
  ) {
    return;
  }
  const heading = pageHeadingSelectors(pathname)
    .map((selector) => document.querySelector<HTMLElement>(selector))
    .find((el) => el !== null);
  const target = heading ?? document.getElementById(MAIN_CONTENT_ID);
  if (!target) return;
  if (!target.hasAttribute("tabindex")) target.setAttribute("tabindex", "-1");
  target.classList.add("outline-none");
  target.focus({ preventScroll: true });
}

/**
 * Moves focus to the page heading after a client-side navigation, so a keyboard or screen reader
 * user starts at the new page (WCAG 2.4.3). The first load and a change of search or hash only
 * keep focus where it is.
 */
export function FocusOnNavigate() {
  const router = useRouter();
  useEffect(
    () =>
      router.subscribe("onResolved", (event) => {
        if (!event.fromLocation || !event.pathChanged) return;
        const pathname = event.toLocation.pathname;
        // The new page renders in the frame after the router resolves.
        requestAnimationFrame(() => moveFocus(pathname));
      }),
    [router],
  );
  return null;
}
