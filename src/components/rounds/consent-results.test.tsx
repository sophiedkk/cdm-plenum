// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The results of a closed Team round (DE20, ADR 0023): each answer and reason by name, the outcome
// in the team's words, and a Settle button that only the facilitator gets and only for an element
// that is still To discuss, whose dialog needs a decision and a note.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { ElementResult } from "@/lib/consensus";
import type { ElementRoundResult } from "@/server/rounds/results";
import { ConsentResults } from "./consent-results";

// The Radix select measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.scrollIntoView ??= () => {};

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const RESULT: ElementResult = {
  responses: 0,
  rated: 0,
  unableToRate: 0,
  distribution: [],
  median: null,
  topPct: 0,
  bottomPct: 0,
  outcome: "no_consensus",
};

function element(
  id: string,
  name: string,
  outcome: ElementRoundResult["outcome"],
  consent: NonNullable<ElementRoundResult["consent"]>,
): ElementRoundResult {
  return { id, name, reference: null, outcome, result: RESULT, groups: [], group: null, consent };
}

const COUNTS = { include: 0, leave_out: 0, discuss: 0, abstain: 0 };

const ELEMENTS = [
  element("e-1", "Systolic pressure", "included", {
    counts: { ...COUNTS, include: 2 },
    answers: [
      { name: "Ann", answer: "include", reason: null },
      { name: "Bo", answer: "include", reason: "Core of the concept" },
    ],
    settled: null,
  }),
  element("e-2", "Cuff size", "no_consensus", {
    counts: { ...COUNTS, include: 1, discuss: 1 },
    answers: [
      { name: "Ann", answer: "include", reason: null },
      { name: "Bo", answer: "discuss", reason: "Unclear definition" },
    ],
    settled: null,
  }),
  element("e-3", "Body position", "excluded", {
    counts: { ...COUNTS, discuss: 1, leave_out: 1 },
    answers: [{ name: "Cas", answer: "leave_out", reason: "Out of scope" }],
    settled: { note: "Covered by the cuff element", at: "2026-11-26T10:00:00Z" },
  }),
];

describe("ConsentResults", () => {
  it("names the outcomes in the team's words and counts the answers", () => {
    render(<ConsentResults elements={ELEMENTS} settle={null} afterSettle={() => {}} />);
    const items = screen.getAllByRole("listitem").filter((item) => item.querySelector("details"));
    expect(items).toHaveLength(3);
    expect(items[0]?.textContent).toContain("In the model");
    expect(items[0]?.textContent).toContain("2 include, 0 leave out, 0 discuss, 0 unable to judge");
    expect(items[1]?.textContent).toContain("To discuss");
    expect(items[2]?.textContent).toContain("Not in the model");
    expect(items[2]?.textContent).toContain(
      "Settled after the discussion: Covered by the cuff element",
    );
  });

  it("shows each answer and reason by name under Answers", () => {
    render(<ConsentResults elements={ELEMENTS} settle={null} afterSettle={() => {}} />);
    expect(document.querySelectorAll("summary")).toHaveLength(3);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Bo: Include (Core of the concept)");
    expect(text).toContain("Bo: Discuss (Unclear definition)");
    expect(text).toContain("Cas: Leave out (Out of scope)");
  });

  it("gives no Settle button without the facilitator's action", () => {
    render(<ConsentResults elements={ELEMENTS} settle={null} afterSettle={() => {}} />);
    expect(screen.queryByRole("button", { name: /Settle/ })).toBeNull();
  });

  it("gives the facilitator a Settle button for the element still To discuss only", () => {
    render(<ConsentResults elements={ELEMENTS} settle={vi.fn()} afterSettle={() => {}} />);
    const buttons = screen.getAllByRole("button", { name: /^Settle/ });
    expect(buttons.map((button) => button.textContent)).toEqual(["Settle: Cuff size"]);
  });

  it("asks a decision and a note, then settles", async () => {
    const settle = vi.fn(async () => ({ ok: true }) as const);
    const afterSettle = vi.fn();
    render(<ConsentResults elements={ELEMENTS} settle={settle} afterSettle={afterSettle} />);
    fireEvent.click(screen.getByRole("button", { name: /^Settle/ }));
    const dialog = await screen.findByRole("dialog", { name: "Settle Cuff size" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Settle" }));
    await waitFor(() =>
      expect(within(dialog).getByText("Choose in the model or not in the model.")).toBeTruthy(),
    );
    expect(within(dialog).getByText("Write a short note to settle this element.")).toBeTruthy();
    expect(settle).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("combobox", { name: "Decision" }));
    fireEvent.click(await screen.findByRole("option", { name: "Not in the model" }));
    fireEvent.change(within(dialog).getByLabelText("Note"), {
      target: { value: "  Covered by another element  " },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Settle" }));
    await waitFor(() =>
      expect(settle).toHaveBeenCalledWith("e-2", "excluded", "Covered by another element"),
    );
    await waitFor(() => expect(afterSettle).toHaveBeenCalledWith("Cuff size"));
  });

  it("shows the server's refusal in the dialog", async () => {
    const settle = vi.fn(async () => ({ ok: false, error: "element_not_to_discuss" }) as const);
    render(<ConsentResults elements={ELEMENTS} settle={settle} afterSettle={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /^Settle/ }));
    const dialog = await screen.findByRole("dialog", { name: "Settle Cuff size" });
    fireEvent.click(within(dialog).getByRole("combobox", { name: "Decision" }));
    fireEvent.click(await screen.findByRole("option", { name: "In the model" }));
    fireEvent.change(within(dialog).getByLabelText("Note"), { target: { value: "Agreed" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Settle" }));
    await waitFor(() =>
      expect(
        within(dialog).getByText("Only an element that is still To discuss can be settled."),
      ).toBeTruthy(),
    );
  });
});
