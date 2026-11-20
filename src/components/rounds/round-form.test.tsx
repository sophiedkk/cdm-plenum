// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The round setup form (DE1, DE2, DE4): the rule in plain words, the rule checks at the field
// that needs the fix, the closing date and the elements, and the server's refusals.
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

function renderForm(
  save: (setup: unknown) => Promise<RoundSetupOutcome>,
  initial: Partial<Parameters<typeof RoundForm>[0]["initial"]> = {},
) {
  const onSaved = vi.fn();
  render(
    <RoundForm
      elements={ELEMENTS}
      initial={{
        elementIds: ["e-1", "e-2"],
        rule: DEFAULT_RULE,
        facilitatorSeesRaters: false,
        closesAt: TOMORROW,
        ...initial,
      }}
      submitLabel="Create draft round"
      save={save}
      onSaved={onSaved}
    />,
  );
  return { onSaved, submit: screen.getByRole("button", { name: "Create draft round" }) };
}

describe("RoundForm", () => {
  it("explains the default rule in plain words", () => {
    renderForm(vi.fn());
    expect(
      screen.getByText(
        "In the archetype when at least 70% score 7 to 9 and at most 15% score 1 to 3.",
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Not in this archetype when at least 70% score 1 to 3 and at most 15% score 7 to 9.",
      ),
    ).toBeTruthy();
  });

  it("shows overlapping bands at the top band field and does not send", async () => {
    const save = vi.fn();
    const { submit } = renderForm(save);
    const topBand = screen.getByLabelText("Top band starts at");
    fireEvent.change(topBand, { target: { value: "2" } });
    fireEvent.click(submit);
    expect(
      await screen.findByText("The top band must start above the end of the bottom band."),
    ).toBeTruthy();
    expect(topBand.getAttribute("aria-invalid")).toBe("true");
    await waitFor(() => expect(document.activeElement).toBe(topBand));
    expect(save).not.toHaveBeenCalled();
  });

  it("asks for a closing date and at least one element", async () => {
    const save = vi.fn();
    const { submit } = renderForm(save, { elementIds: [], closesAt: "" });
    fireEvent.click(submit);
    expect(await screen.findByText("Enter the closing date and time.")).toBeTruthy();
    expect(screen.getByText("Choose at least one element to rate.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("refuses a closing date in the past", async () => {
    const save = vi.fn();
    const { submit } = renderForm(save, { closesAt: "2020-01-01T12:00" });
    fireEvent.click(submit);
    expect(await screen.findByText("The closing date must be in the future.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("sends the rule, the elements, the setting and the closing instant", async () => {
    const save = vi.fn(async () => ({ ok: true }) as const);
    const { submit, onSaved } = renderForm(save);
    fireEvent.change(screen.getByLabelText("Agreement (%)"), { target: { value: "75,5" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Cuff size" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "The facilitator may see who gave which rating" }),
    );
    fireEvent.click(submit);
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(save).toHaveBeenCalledWith({
      elementIds: ["e-1"],
      rule: { ...DEFAULT_RULE, agreementPct: 75.5 },
      facilitatorSeesRaters: true,
      closesAt: new Date(TOMORROW).toISOString(),
    });
  });

  it("shows a rule the server refused at the field, translated", async () => {
    const save = vi.fn(
      async () => ({ ok: false, error: "rule_invalid", rule: "agreement_not_above_half" }) as const,
    );
    const { submit } = renderForm(save);
    fireEvent.click(submit);
    expect(
      await screen.findByText("Agreement must be more than 50% and at most 100%."),
    ).toBeTruthy();
    expect(screen.getByLabelText("Agreement (%)").getAttribute("aria-invalid")).toBe("true");
  });

  it("shows another refusal at the top of the form", async () => {
    const save = vi.fn(async () => ({ ok: false, error: "previous_round_not_closed" }) as const);
    const { submit } = renderForm(save);
    fireEvent.click(submit);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Close the previous round before you start a new one.");
  });

  it("asks round 1 for the rule for proposed elements and sends it trimmed, or null when empty (DE16)", async () => {
    const save = vi.fn(async () => ({ ok: true }) as const);
    const { submit, onSaved } = renderForm(save, {
      proposalRule: "Proposed by at least two participants",
    });
    const rule = screen.getByLabelText("Rule for adding proposed elements");
    expect((rule as HTMLInputElement).value).toBe("Proposed by at least two participants");
    fireEvent.change(rule, { target: { value: " Proposed by at least three participants " } });
    fireEvent.click(submit);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ proposalRule: "Proposed by at least three participants" }),
    );
    fireEvent.change(rule, { target: { value: "  " } });
    fireEvent.click(submit);
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ proposalRule: null }));
  });

  it("refuses a proposal rule longer than the server takes, at the field (DE16)", async () => {
    const save = vi.fn();
    const { submit } = renderForm(save, { proposalRule: "" });
    const rule = screen.getByLabelText("Rule for adding proposed elements");
    fireEvent.change(rule, { target: { value: "x".repeat(501) } });
    fireEvent.click(submit);
    expect(await screen.findByText("Use at most 500 characters.")).toBeTruthy();
    expect(rule.getAttribute("aria-invalid")).toBe("true");
    expect(save).not.toHaveBeenCalled();
  });

  it("has no proposal rule in a later round and shows the rating question", () => {
    renderForm(vi.fn());
    expect(screen.queryByLabelText("Rule for adding proposed elements")).toBeNull();
    expect(
      screen.getByText(
        'Participants answer for each element: "Does this element belong in the archetype, for any use case in scope?"',
      ),
    ).toBeTruthy();
  });

  it("speaks Dutch when the locale is Dutch", () => {
    overwriteGetLocale(() => "nl");
    renderForm(vi.fn());
    expect(
      screen.getByText(
        "In het archetype als minstens 70% 7 tot en met 9 scoort en hoogstens 15% 1 tot en met 3.",
      ),
    ).toBeTruthy();
  });
});
