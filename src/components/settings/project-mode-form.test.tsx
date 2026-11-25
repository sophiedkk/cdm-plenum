// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project mode setting (PR14, ADR 0023): saved when you pick an option, a refusal inline
// with the choice going back, and text with one line why once a round has opened.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { Outcome } from "@/lib/forms/outcome";
import type { ProjectMode } from "@/lib/project-mode";
import { ProjectModeForm } from "./facilitator-settings";

globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

function renderForm(
  save: (mode: ProjectMode) => Promise<Outcome<unknown>>,
  { mode = "delphi", locked = false }: { mode?: ProjectMode; locked?: boolean } = {},
) {
  const onSaved = vi.fn();
  render(<ProjectModeForm mode={mode} locked={locked} save={save} onSaved={onSaved} />);
  return { onSaved };
}

describe("ProjectModeForm", () => {
  it("saves the other mode when you pick it", async () => {
    const save = vi.fn(async () => ({ ok: true, value: null }) as const);
    const { onSaved } = renderForm(save);
    const delphi = screen.getByRole("radio", { name: /Delphi study/ });
    expect(delphi.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Team/ }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith("team"));
    expect(save).toHaveBeenCalledWith("team");
    expect((await screen.findByRole("status")).textContent).toBe("Saved");
  });

  it("shows the refusal and goes back to the saved mode", async () => {
    const save = vi.fn(async () => ({ ok: false, error: "mode_locked" }) as const);
    const { onSaved } = renderForm(save);
    fireEvent.click(screen.getByRole("radio", { name: /Team/ }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("A round has opened"),
    );
    expect(screen.getByRole("radio", { name: /Delphi study/ }).getAttribute("aria-checked")).toBe(
      "true",
    );
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("reads as text with one line why once a round has opened", () => {
    renderForm(vi.fn(), { mode: "team", locked: true });
    expect(screen.queryByRole("radio")).toBeNull();
    const text = screen.getByTestId("project-mode-locked").textContent;
    expect(text).toContain("Named participants decide by consent.");
    expect(text).toContain("A round has opened, so this can no longer change.");
  });

  it("speaks Dutch when the locale is Dutch", () => {
    overwriteGetLocale(() => "nl");
    renderForm(vi.fn());
    expect(screen.getByRole("radio", { name: /Delphi-studie/ })).toBeTruthy();
  });
});
