// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The round setup form of a Team project (DE20): the elements and the closing date, with no scale,
// no consensus rule and no setting for who sees the raters.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { DEFAULT_RULE } from "@/lib/consensus";
import { RoundForm, type RoundSetupOutcome } from "./round-form";

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

const ELEMENTS = [
  { id: "e-1", name: "Systolic pressure", description: "The highest pressure" },
  { id: "e-2", name: "Cuff size", description: "" },
];

const TOMORROW = (() => {
  const date = new Date(Date.now() + 86_400_000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T17:00`;
})();

function renderTeamForm(save: (setup: unknown) => Promise<RoundSetupOutcome>) {
  render(
    <RoundForm
      mode="team"
      elements={ELEMENTS}
      initial={{
        elementIds: ["e-1", "e-2"],
        rule: DEFAULT_RULE,
        facilitatorSeesRaters: false,
        closesAt: TOMORROW,
      }}
      submitLabel="Create draft round"
      save={save}
      onSaved={vi.fn()}
    />,
  );
}

describe("RoundForm in a Team project", () => {
  it("has no scale, rule or rater setting, and says members answer by name", () => {
    renderTeamForm(async () => ({ ok: true }));
    expect(screen.queryByLabelText(/Lowest score/)).toBeNull();
    expect(screen.queryByText("Use the default rule")).toBeNull();
    expect(screen.queryByRole("checkbox", { name: /who gave which rating/ })).toBeNull();
    expect(screen.getByText(/Members answer Include, Leave out or Discuss/)).toBeTruthy();
    expect(screen.getByLabelText(/Closing date/)).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Systolic pressure" })).toBeTruthy();
  });

  it("sends the elements and the closing date, and no rule", async () => {
    const save = vi.fn(async (_setup: unknown) => ({ ok: true }) as const);
    renderTeamForm(save);
    fireEvent.click(screen.getByRole("button", { name: "Create draft round" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const setup = save.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(setup["elementIds"]).toEqual(["e-1", "e-2"]);
    expect(typeof setup["closesAt"]).toBe("string");
    expect("rule" in setup).toBe(false);
    expect("facilitatorSeesRaters" in setup).toBe(false);
  });

  it("still asks at least one element", async () => {
    const save = vi.fn(async () => ({ ok: true }) as const);
    renderTeamForm(save);
    fireEvent.click(screen.getByRole("button", { name: "Select none" }));
    fireEvent.click(screen.getByRole("button", { name: "Create draft round" }));
    await waitFor(() => expect(screen.getByText(/Choose at least one element/)).toBeTruthy());
    expect(save).not.toHaveBeenCalled();
  });
});
