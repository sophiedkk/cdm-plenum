// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The keys of the rating screen (DE18): a digit chooses that score, U "unable to rate", N the
// next card and P the previous one. They only act when the participant is not typing, so a
// reason or a flag never loses a letter to them.
import { useEffect, useRef } from "react";

/** Where a key is text or a choice of its own: fields, selects and any form, such as a flag's. */
const TYPING =
  "input, textarea, select, [contenteditable]:not([contenteditable='false']), [role='combobox'], [role='listbox'], form";

/** The key of a shortcut, lower case, or null when the key press is not one for the screen. */
export function shortcutKey(event: KeyboardEvent): string | null {
  if (event.defaultPrevented || event.isComposing) return null;
  if (event.ctrlKey || event.metaKey || event.altKey) return null;
  const target = event.target;
  if (target instanceof Element && target.closest(TYPING)) return null;
  return event.key.length === 1 ? event.key.toLowerCase() : null;
}

/**
 * Calls `handle` with the key of each shortcut pressed anywhere on the page while the component
 * is shown; `handle` returns true when it used the key.
 */
export function useShortcuts(handle: (key: string) => boolean): void {
  const latest = useRef(handle);
  latest.current = handle;
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const key = shortcutKey(event);
      if (key !== null && latest.current(key)) event.preventDefault();
    };
    document.addEventListener("keydown", listener);
    return () => document.removeEventListener("keydown", listener);
  }, []);
}
