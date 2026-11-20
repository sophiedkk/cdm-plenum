// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readThemeChoice,
  resolveTheme,
  setThemeChoice,
  subscribeThemeChoice,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "./theme";

let systemDark = false;
const listeners = new Set<() => void>();

beforeEach(() => {
  systemDark = false;
  listeners.clear();
  window.localStorage.clear();
  delete document.documentElement.dataset["theme"];
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return systemDark;
      },
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function runInitScript(): string | undefined {
  new Function(THEME_INIT_SCRIPT)();
  return document.documentElement.dataset["theme"];
}

describe("resolveTheme", () => {
  it("follows the system only for the system choice", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("readThemeChoice", () => {
  it("is system without a stored choice and for a value it does not know", () => {
    expect(readThemeChoice()).toBe("system");
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readThemeChoice()).toBe("system");
  });

  it("is system when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(readThemeChoice()).toBe("system");
    vi.restoreAllMocks();
  });
});

describe("setThemeChoice", () => {
  it("stores the choice, applies it, and forgets it for system", () => {
    setThemeChoice("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    setThemeChoice("system");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });

  it("tells subscribers, and re-applies system when the system setting changes", () => {
    const onChange = vi.fn();
    const unsubscribe = subscribeThemeChoice(onChange);
    setThemeChoice("system");
    expect(onChange).toHaveBeenCalledTimes(1);
    systemDark = true;
    for (const listener of listeners) listener();
    expect(document.documentElement.dataset["theme"]).toBe("dark");
    unsubscribe();
    expect(listeners.size).toBe(0);
  });

  it("keeps an explicit choice when the system setting changes", () => {
    setThemeChoice("light");
    subscribeThemeChoice(() => undefined);
    systemDark = true;
    for (const listener of listeners) listener();
    expect(document.documentElement.dataset["theme"]).toBe("light");
  });
});

describe("THEME_INIT_SCRIPT", () => {
  it("resolves the same theme as the module, for every stored choice", () => {
    for (const dark of [false, true]) {
      systemDark = dark;
      for (const stored of [null, "light", "dark", "system", "sepia"]) {
        window.localStorage.clear();
        if (stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
        expect(runInitScript()).toBe(resolveTheme(readThemeChoice(), dark));
      }
    }
  });
});
