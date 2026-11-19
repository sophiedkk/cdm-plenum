// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One element on the rating screen (DE3, DE7, DE8): a fieldset named by the element, a choice
// saves at once, "unable to rate" saves no score, and the previous round sits next to it.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { DEFAULT_RULE, elementResult } from "@/lib/consensus";
import type { MyElement } from "@/server/rounds/ratings";
import { RatingElement } from "./rating-element";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const ELEMENT: MyElement = {
  id: "e-1",
  name: "Systolic pressure",
  description: "The highest pressure in the cycle",
  own: { rated: false, score: null, reason: null },
  previous: null,
};

function renderElement(element: MyElement = ELEMENT, editable = true) {
  const save = vi.fn(async () => ({ ok: true }) as const);
  const clear = vi.fn(async () => ({ ok: true }) as const);
  render(
    <RatingElement
      element={element}
      dataType="DV_QUANTITY"
      rule={DEFAULT_RULE}
      editable={editable}
      save={save}
      clear={clear}
    />,
  );
  return { save, clear, group: screen.getByRole("group", { name: "Systolic pressure" }) };
}

describe("RatingElement", () => {
  it("is one fieldset named by the element, with the scale, its band meaning and the type", () => {
    const { group } = renderElement();
    expect(within(group).getAllByRole("radio")).toHaveLength(10);
    expect(within(group).getByRole("radio", { name: "1, not important" })).toBeTruthy();
    expect(within(group).getByRole("radio", { name: "9, critical" })).toBeTruthy();
    expect(within(group).getByRole("radio", { name: "Unable to rate" })).toBeTruthy();
    expect(group.textContent).toContain("Data type: DV_QUANTITY");
  });

  it("saves a score at once, with the reason, and says so", async () => {
    const { save } = renderElement();
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "Needed for every reading" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "8" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(8, "Needed for every reading"));
    expect((await screen.findByRole("status")).textContent).toBe("Saved");
  });

  it("saves unable to rate as no score", async () => {
    const { save } = renderElement();
    fireEvent.click(screen.getByRole("radio", { name: "Unable to rate" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(null, ""));
  });

  it("shows a refusal of the save, translated", async () => {
    const save = vi.fn(async () => ({ ok: false, error: "round_not_open" }) as const);
    render(
      <RatingElement
        element={ELEMENT}
        dataType={null}
        rule={DEFAULT_RULE}
        editable
        save={save}
        clear={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    expect((await screen.findByRole("status")).textContent).toBe("This round is not open.");
  });

  it("shows the own earlier rating, the group result and the anonymous reasons", () => {
    renderElement({
      ...ELEMENT,
      own: { rated: true, score: 7, reason: null },
      previous: {
        number: 1,
        own: { rated: true, score: 5, reason: "Unsure" },
        result: elementResult([5, 8, 9], DEFAULT_RULE),
        groups: [],
        reasons: ["Unsure", "Used in every protocol"],
      },
    });
    expect(screen.getByText("In round 1")).toBeTruthy();
    expect(screen.getByText("Used in every protocol")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "7" }).getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByRole("table", { name: "Scores for Systolic pressure in round 1" }),
    ).toBeTruthy();
  });

  it("cannot change a rating once the round is no longer open", () => {
    renderElement(ELEMENT, false);
    expect(screen.getByRole("radio", { name: "5" }).hasAttribute("disabled")).toBe(true);
  });
});
