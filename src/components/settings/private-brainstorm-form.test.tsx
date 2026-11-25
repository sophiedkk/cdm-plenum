// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The private-first brainstorm setting (EL13): on by default, applied when you flip the
// switch, a refusal inline next to it, and a note instead of the switch after the reveal.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { Outcome } from "@/lib/forms/outcome";
import { PrivateBrainstormForm } from "./facilitator-settings";

// The Radix checkbox measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const LABEL = "Participants first see only their own elements, until you reveal the board";

function renderForm(save: (enabled: boolean) => Promise<Outcome<unknown>>, revealed = false) {
  const onSaved = vi.fn();
  render(<PrivateBrainstormForm enabled revealed={revealed} save={save} onSaved={onSaved} />);
  return { onSaved };
}

describe("PrivateBrainstormForm", () => {
  it("switches the setting off and saves it", async () => {
    const save = vi.fn(async () => ({ ok: true, value: null }) as const);
    const { onSaved } = renderForm(save);
    const box = screen.getByRole("switch", { name: LABEL });
    expect(box.getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("button")).toBeNull();
    fireEvent.click(box);
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(false));
    expect(save).toHaveBeenCalledWith(false);
    expect((await screen.findByRole("status")).textContent).toBe("Saved");
  });

  it("shows a refusal next to the switch and switches it back", async () => {
    const save = vi.fn(async () => ({ ok: false, error: "board_already_revealed" }) as const);
    const { onSaved } = renderForm(save);
    fireEvent.click(screen.getByRole("switch", { name: LABEL }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "The board has already been revealed.",
      ),
    );
    expect(screen.getByRole("switch", { name: LABEL }).getAttribute("aria-checked")).toBe("true");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("shows a note instead of the setting after the reveal", () => {
    renderForm(vi.fn(), true);
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.getByTestId("private-brainstorm-revealed").textContent).toBe(
      "You revealed the board, so this setting no longer applies.",
    );
  });
});
