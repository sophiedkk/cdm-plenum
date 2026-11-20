// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One element on the rating screen (DE3, DE7, DE8): a fieldset named by the element, a choice
// saves at once, "unable to rate" saves no score, and the previous round sits next to it: the own
// score and the distribution per group, never an outcome label (DE15).
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
  flags: [],
  previous: null,
};

const LATER: MyElement & { previous: NonNullable<MyElement["previous"]> } = {
  ...ELEMENT,
  own: { rated: true, score: 7, reason: null },
  previous: {
    number: 1,
    own: { rated: true, score: 5, reason: "Unsure" },
    result: elementResult([5, 8, 8, 9, 9, 9], DEFAULT_RULE),
    groups: [
      { groupId: "g-1", groupName: "Nursing", result: elementResult([8, 9, 9], DEFAULT_RULE) },
      // Two scores: the screen leaves the group out even if the server sent it.
      { groupId: "g-2", groupName: "Architecture", result: elementResult([5, 8], DEFAULT_RULE) },
    ],
    reasons: ["Unsure", "Used in every protocol"],
  },
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
    expect(
      within(group).getByRole("radio", { name: "1, does not belong in the model" }),
    ).toBeTruthy();
    expect(within(group).getByRole("radio", { name: "9, belongs in the model" })).toBeTruthy();
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

  it("shows the own earlier rating and the distribution per group, with details and reasons", () => {
    renderElement(LATER);
    const group = screen.getByRole("group", { name: "Systolic pressure" });
    expect(group.textContent).toContain("Your rating in round 1: 5");
    const distributions = screen.getByRole("list", {
      name: "Scores for Systolic pressure in round 1, from everyone and per stakeholder group",
    });
    const items = within(distributions).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Everyone", "Nursing"]);
    expect(
      within(items[0] as HTMLElement).getByRole("img", {
        name: "Distribution of the scores: score 5: 1, score 8: 2, score 9: 3",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Details and reasons (2)")).toBeTruthy();
    expect(screen.getByText("Used in every protocol")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "7" }).getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByRole("table", { name: "Scores for Systolic pressure in round 1" }),
    ).toBeTruthy();
  });

  it("puts the median and the band shares behind details", () => {
    renderElement(LATER);
    const summary = screen.getByText("Details and reasons (2)");
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain("Median");
    expect(details?.textContent).toContain("In the top band");
    const line = summary.closest("details")?.previousElementSibling;
    expect(line?.textContent).not.toContain("Median");
  });

  it("shows no outcome label of the earlier round, overall or per group (DE15)", () => {
    renderElement(LATER);
    const text = screen.getByRole("group", { name: "Systolic pressure" }).textContent ?? "";
    for (const label of ["In the model", "Not in the model", "No consensus", "Outcome"]) {
      expect(text).not.toContain(label);
    }
  });

  it("never shows a stakeholder group with fewer than 3 scores (Q-PRIV-3)", () => {
    renderElement(LATER);
    expect(screen.queryByText("Architecture")).toBeNull();
  });

  it("says the participant did not rate the element in the earlier round", () => {
    renderElement({
      ...LATER,
      previous: { ...LATER.previous, own: { rated: false, score: null, reason: null } },
    } as MyElement);
    expect(screen.getByText("Your rating in round 1: Not rated")).toBeTruthy();
  });

  it("cannot change a rating once the round is no longer open", () => {
    renderElement(ELEMENT, false);
    expect(screen.getByRole("radio", { name: "5" }).hasAttribute("disabled")).toBe(true);
  });
});
