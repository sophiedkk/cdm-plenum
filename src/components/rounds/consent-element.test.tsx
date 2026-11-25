// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One card of a Team round (DE20): the four answers as a radio group, a reason that Leave out and
// Discuss need with its error at the field, saving at once when no reason is needed, and the
// answers of the previous round by name.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { MyElement } from "@/server/rounds/ratings";
import { ConsentElement } from "./consent-element";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const ELEMENT: MyElement = {
  id: "e-1",
  name: "Systolic pressure",
  description: "The highest pressure in the cycle",
  reference: null,
  own: { rated: false, score: null, reason: null, answer: null },
  flags: [],
  previous: null,
  group: null,
};

const DONE = async () => ({ ok: true }) as const;

function renderCard(element: MyElement = ELEMENT, editable = true) {
  const save = vi.fn(DONE);
  const clear = vi.fn(DONE);
  render(
    <ConsentElement
      element={element}
      position={{ index: 2, total: 5 }}
      editable={editable}
      save={save}
      clear={clear}
    />,
  );
  return { save, clear, card: screen.getByRole("region", { name: "Systolic pressure" }) };
}

describe("ConsentElement", () => {
  it("shows the question and the four answers, and no scale", () => {
    const { card } = renderCard();
    expect(card.textContent).toContain("Element 2 of 5");
    const group = within(card).getByRole("radiogroup", {
      name: "Should this element be in the data model?",
    });
    expect(
      within(group)
        .getAllByRole("radio")
        .map((radio) => radio.textContent),
    ).toEqual(["Include", "Leave out", "Discuss", "Unable to judge"]);
    expect(within(card).queryByRole("radio", { name: "9" })).toBeNull();
  });

  it("saves Include at once, with the reason optional", async () => {
    const { save, card } = renderCard();
    expect(within(card).getByLabelText("Reason (optional)")).toBeTruthy();
    fireEvent.click(within(card).getByRole("radio", { name: "Include" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("include", ""));
    await waitFor(() =>
      expect(within(card).getByRole("status").textContent).toBe("Saved: Include"),
    );
  });

  it("asks a reason for Leave out and Discuss at the field, and saves once it is there", async () => {
    const { save, card } = renderCard();
    fireEvent.click(within(card).getByRole("radio", { name: "Leave out" }));
    const field = within(card).getByLabelText("Reason (required)");
    expect(save).not.toHaveBeenCalled();
    expect(field.getAttribute("aria-invalid")).toBe("true");
    const error = within(card).getByText("Give a reason for Leave out and Discuss.");
    expect(field.getAttribute("aria-describedby")).toBe(error.id);
    expect(within(card).getByRole("status").textContent).toBe("Add a reason to save this answer.");

    fireEvent.change(field, { target: { value: "Covered by another element" } });
    expect(field.getAttribute("aria-invalid")).toBe("false");
    fireEvent.blur(field);
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith("leave_out", "Covered by another element"),
    );
  });

  it("keeps the reason when the answer changes from Leave out to Discuss", async () => {
    const { save, card } = renderCard({
      ...ELEMENT,
      own: { rated: true, score: null, reason: "Too detailed", answer: "leave_out" },
    });
    fireEvent.click(within(card).getByRole("radio", { name: "Discuss" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("discuss", "Too detailed"));
  });

  it("saves Unable to judge without a reason", async () => {
    const { save, card } = renderCard();
    fireEvent.click(within(card).getByRole("radio", { name: "Unable to judge" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("abstain", ""));
  });

  it("shows the server's refusal of a missing reason at the field", async () => {
    const save = vi.fn(async () => ({ ok: false, error: "consent_reason_required" }) as const);
    render(
      <ConsentElement
        element={{
          ...ELEMENT,
          own: { rated: true, score: null, reason: "x", answer: "discuss" },
        }}
        position={{ index: 1, total: 1 }}
        editable
        save={save}
        clear={vi.fn(DONE)}
      />,
    );
    const card = screen.getByRole("region", { name: "Systolic pressure" });
    fireEvent.click(within(card).getByRole("radio", { name: "Leave out" }));
    await waitFor(() => expect(save).toHaveBeenCalled());
    await waitFor(() =>
      expect(within(card).getByText("Give a reason for Leave out and Discuss.")).toBeTruthy(),
    );
  });

  it("removes the answer", async () => {
    const { clear, card } = renderCard({
      ...ELEMENT,
      own: { rated: true, score: null, reason: null, answer: "include" },
    });
    fireEvent.click(within(card).getByRole("button", { name: "Remove my answer" }));
    await waitFor(() => expect(clear).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        within(card).getByRole("radio", { name: "Include" }).getAttribute("aria-checked"),
      ).toBe("false"),
    );
  });

  it("is read-only when the round is closed", () => {
    const { card } = renderCard(ELEMENT, false);
    for (const radio of within(card).getAllByRole("radio")) {
      expect(radio.hasAttribute("disabled")).toBe(true);
    }
  });

  it("lists the previous round's answers by name in a panel under its button", () => {
    const { card } = renderCard({
      ...ELEMENT,
      previousConsent: {
        number: 1,
        outcome: "no_consensus",
        answers: [
          { name: "Ann", answer: "include", reason: null },
          { name: "Bo", answer: "discuss", reason: "Unclear definition" },
        ],
      },
    });
    const button = within(card).getByRole("button", { name: "Answers in round 1" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    const panel = document.getElementById(button.getAttribute("aria-controls") ?? "");
    expect(panel?.textContent).toContain("Ann: Include");
    expect(panel?.textContent).toContain("Bo: Discuss (Unclear definition)");
  });
});
