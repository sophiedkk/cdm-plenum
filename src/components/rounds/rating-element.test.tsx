// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One card of the rating screen (DE3, DE7, DE8, DE18): a region named by the element's heading, a
// choice saves at once, "unable to rate" saves no score, the details are folded and marked not
// rated (DE1, DE17), and the previous round sits next to it: the own score and the distribution
// per group, never an outcome label (DE15).
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { DEFAULT_RULE, elementResult } from "@/lib/consensus";
import type { MyElement } from "@/server/rounds/ratings";
import type { ElementDetails } from "./detail-flags";
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

const DETAILS: ElementDetails = { dataType: "DV_QUANTITY", cardinality: "0..1", values: [] };
const DONE = async () => ({ ok: true }) as const;

function renderElement(element: MyElement = ELEMENT, editable = true) {
  const save = vi.fn(DONE);
  const clear = vi.fn(DONE);
  render(
    <RatingElement
      element={element}
      details={DETAILS}
      position={{ index: 2, total: 5 }}
      rule={DEFAULT_RULE}
      editable={editable}
      save={save}
      clear={clear}
      saveFlag={vi.fn(DONE)}
      removeFlag={vi.fn(DONE)}
    />,
  );
  return { save, clear, group: screen.getByRole("region", { name: "Systolic pressure" }) };
}

describe("RatingElement", () => {
  it("is one card named by the element, with its place, the question and the scale", () => {
    const { group } = renderElement();
    expect(
      within(group).getByRole("heading", { level: 3, name: "Systolic pressure" }),
    ).toBeTruthy();
    expect(group.textContent).toContain("Element 2 of 5");
    expect(group.textContent).toContain("The highest pressure in the cycle");
    const scale = within(group).getByRole("radiogroup", {
      name: "Does this element belong in the data model, for any use case in scope?",
    });
    expect(within(scale).getAllByRole("radio")).toHaveLength(10);
    expect(
      within(scale).getByRole("radio", { name: "1, does not belong in the model" }),
    ).toBeTruthy();
    expect(within(scale).getByRole("radio", { name: "9, belongs in the model" })).toBeTruthy();
    expect(within(scale).getByRole("radio", { name: "Unable to rate" })).toBeTruthy();
  });

  it("folds the data type, cardinality and values away and marks them not rated (DE1)", () => {
    const { group } = renderElement();
    const summary = within(group).getByText("Data type, cardinality and values (not rated)");
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
    expect(details?.textContent).toContain("DV_QUANTITY");
    expect(details?.textContent).toContain("0..1");
    expect(details?.textContent).toContain("No values");
    // Outside the folded details the card says nothing about the data type.
    const rest = [...group.children].filter((child) => child !== details);
    expect(rest.map((child) => child.textContent).join(" ")).not.toContain("DV_QUANTITY");
  });

  it("counts the participant's own flags in the summary of the details (DE17)", () => {
    renderElement({ ...ELEMENT, flags: [{ kind: "values", reason: "No unit" }] });
    expect(
      screen.getByText("Data type, cardinality and values (not rated, flagged by you: 1)"),
    ).toBeTruthy();
  });

  it("gives its heading to the card's ref, focusable from code only", () => {
    const ref = { current: null as HTMLHeadingElement | null };
    render(
      <RatingElement
        element={ELEMENT}
        details={DETAILS}
        position={{ index: 1, total: 1 }}
        headingRef={ref}
        rule={DEFAULT_RULE}
        editable
        save={vi.fn(DONE)}
        clear={vi.fn(DONE)}
        saveFlag={vi.fn(DONE)}
        removeFlag={vi.fn(DONE)}
      />,
    );
    expect(ref.current?.textContent).toBe("Systolic pressure");
    expect(ref.current?.getAttribute("tabindex")).toBe("-1");
  });

  it("saves a score at once, with the reason, and says so", async () => {
    const { save } = renderElement();
    fireEvent.change(screen.getByLabelText("Reason (optional)"), {
      target: { value: "Needed for every reading" },
    });
    fireEvent.click(screen.getByRole("radio", { name: "8" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith(8, "Needed for every reading"));
    expect((await screen.findByText("Saved")).getAttribute("role")).toBe("status");
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
        details={DETAILS}
        position={{ index: 1, total: 1 }}
        rule={DEFAULT_RULE}
        editable
        save={save}
        clear={vi.fn()}
        saveFlag={vi.fn(DONE)}
        removeFlag={vi.fn(DONE)}
      />,
    );
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    expect((await screen.findByText("This round is not open.")).getAttribute("role")).toBe(
      "status",
    );
  });

  it("shows the own earlier rating and the distribution per group, with details and reasons", () => {
    renderElement(LATER);
    const group = screen.getByRole("region", { name: "Systolic pressure" });
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
    const text = screen.getByRole("region", { name: "Systolic pressure" }).textContent ?? "";
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

  it("cannot change a rating or flag a detail once the round is no longer open", () => {
    renderElement(ELEMENT, false);
    expect(screen.getByRole("radio", { name: "5" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: /Flag as wrong/ })).toBeNull();
  });
});
