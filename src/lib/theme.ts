// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The colour theme: light, dark, or the system setting. The choice stays in this browser
// (localStorage); `<html data-theme>` carries the resolved theme, which the CSS reads.

export const THEME_CHOICES = ["light", "dark", "system"] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "cdm-plenum-theme";
const CHANGE_EVENT = "cdm-plenum-theme-change";
const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === "string" && (THEME_CHOICES as readonly string[]).includes(value);
}

/** The stored choice; "system" when nothing (valid) is stored or storage is blocked. */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(choice: ThemeChoice, systemDark: boolean): Theme {
  if (choice === "system") return systemDark ? "dark" : "light";
  return choice;
}

function systemIsDark(): boolean {
  return window.matchMedia(DARK_QUERY).matches;
}

/** Sets `<html data-theme>` to the theme the choice resolves to now. */
export function applyThemeChoice(choice: ThemeChoice): void {
  document.documentElement.dataset["theme"] = resolveTheme(choice, systemIsDark());
}

/** Stores the choice, applies it, and tells the components that read it. */
export function setThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY);
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Storage blocked: the choice holds for this page only.
  }
  applyThemeChoice(choice);
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: choice }));
}

/**
 * Calls `onChange` when the choice changes in this tab or another, and re-applies "system" when
 * the system setting changes. Returns the unsubscribe function (for useSyncExternalStore).
 */
export function subscribeThemeChoice(onChange: () => void): () => void {
  const media = window.matchMedia(DARK_QUERY);
  const onSystem = () => {
    if (readThemeChoice() === "system") applyThemeChoice("system");
    onChange();
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_STORAGE_KEY) return;
    applyThemeChoice(readThemeChoice());
    onChange();
  };
  media.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    media.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Runs in `<head>` before the first paint, so a dark page never flashes light. It repeats
 * readThemeChoice and resolveTheme in plain script; theme.test.ts runs it to keep them equal.
 */
export const THEME_INIT_SCRIPT = `(function(){var c="system";try{var s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(s==="light"||s==="dark")c=s}catch(e){}var d=c==="dark"||(c==="system"&&window.matchMedia(${JSON.stringify(
  DARK_QUERY,
)}).matches);document.documentElement.dataset.theme=d?"dark":"light"})();`;
