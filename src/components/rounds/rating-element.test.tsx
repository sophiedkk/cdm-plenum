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
import { type ConsensusRule, DEFAULT_RULE, elementResult } from "@/lib/consensus";
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
  reference: null,
  own: { rated: false, score: null, reason: null },
  flags: [],
  previous: null,
  group: null,
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
  it("is a value of a value round with the element as its group and its own question (DT3)", () => {
    const value: MyElement = {
      ...ELEMENT,
      id: "v-1",
      name: "1: Mild",
      description: "",
      group: { id: "e-9", name: "Severity", prompt: null },
    };
    render(
      <RatingElement
        kind="values"
        element={value}
        details={null}
        position={{ index: 1, total: 3 }}
        rule={DEFAULT_RULE}
        editable
        save={vi.fn(DONE)}
        clear={vi.fn(DONE)}
        saveFlag={vi.fn(DONE)}
        removeFlag={vi.fn(DONE)}
      />,
    );
    const card = screen.getByRole("region", { name: "1: Mild" });
    expect(card.textContent).toContain("Value 1 of 3");
    expect(card.textContent).toContain("Severity");
    expect(
      within(card).getByRole("radiogroup", {
        name: "Does this value belong in the element's value list, for any use case in scope?",
      }),
    ).toBeTruthy();
    expect(within(card).queryByText(/not rated\)/)).toBeNull();
  });

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

  it("leaves out the details and their flags while the phase hides them (EL21)", () => {
    render(
      <RatingElement
        element={{ ...ELEMENT, flags: [{ kind: "values", reason: "No unit" }] }}
        details={null}
        position={{ index: 2, total: 5 }}
        rule={DEFAULT_RULE}
        editable
        save={vi.fn(DONE)}
        clear={vi.fn(DONE)}
        saveFlag={vi.fn(DONE)}
        removeFlag={vi.fn(DONE)}
      />,
    );
    const group = screen.getByRole("region", { name: "Systolic pressure" });
    expect(within(group).queryByText(/Data type, cardinality and values/)).toBeNull();
    expect(within(group).queryByRole("button", { name: /Flag/ })).toBeNull();
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
    expect((await screen.findByText("Saved: 8")).getAttribute("role")).toBe("status");
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
    expect(group.textContent).toContain("Your round 1 score: 5");
    openGroupScores();
    const distributions = screen.getByRole("list", {
      name: "Scores for Systolic pressure in round 1, from everyone and per stakeholder group",
    });
    const items = within(distributions).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual(["Everyone", "Nursing"]);
    expect(
      within(items[0] as HTMLElement).getByRole("img", {
        name: "Distribution of the scores: score 5: 1, score 8: 2, score 9: 3. Your score: 5",
      }),
    ).toBeTruthy();
    expect(screen.getByText("Median, band shares and all scores")).toBeTruthy();
    expect(screen.getByText("Used in every protocol")).toBeTruthy();
    expect(screen.getByRole("radio", { name: "7" }).getAttribute("aria-checked")).toBe("true");
    expect(
      screen.getByRole("table", { name: "Scores for Systolic pressure in round 1" }),
    ).toBeTruthy();
  });

  it("puts the median and the band shares behind details", () => {
    renderElement(LATER);
    openGroupScores();
    const summary = screen.getByText("Median, band shares and all scores");
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
    expect(screen.getByText("Your round 1 score: Not rated")).toBeTruthy();
  });

  it("shows the reasons of round 1 on the card, the first three and then all (DE8)", () => {
    const reasons = ["A first", "B second", "C third", "D fourth", "E fifth"];
    renderElement({ ...LATER, previous: { ...LATER.previous, reasons } });
    openGroupScores();
    const list = screen.getByRole("list", { name: "Reasons given, without names" });
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(reasons.slice(0, 3));
    expect(list.closest("details")).toBeNull();
    const all = screen.getByRole("button", { name: "Show all (5)" });
    expect(all.getAttribute("aria-expanded")).toBe("false");
    expect(all.getAttribute("aria-controls")).toBe(list.id);
    fireEvent.click(all);
    expect(
      within(list)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(reasons);
    const fewer = screen.getByRole("button", { name: "Show fewer" });
    expect(fewer.getAttribute("aria-expanded")).toBe("true");
  });

  it("offers no Show all for three reasons or fewer", () => {
    renderElement(LATER);
    expect(screen.queryByRole("button", { name: /Show all/ })).toBeNull();
  });

  it("says so when nobody gave a reason", () => {
    renderElement({ ...LATER, previous: { ...LATER.previous, reasons: [] } });
    openGroupScores();
    expect(screen.getByText("Nobody gave a reason.")).toBeTruthy();
  });

  it("marks the own earlier score on the distribution and above the scale (DE15)", () => {
    renderElement(LATER);
    openGroupScores();
    const everyone = screen.getByRole("img", { name: /Your score: 5$/ });
    expect(everyone.querySelector("[data-own]")).toBeTruthy();
    expect(everyone.querySelector("[data-own-label]")?.getAttribute("data-own-label")).toBe("you");
    // Only the participant's own result carries it, not a group's.
    for (const nursing of screen.getAllByRole("img", {
      name: "Distribution of the scores: score 8: 1, score 9: 2",
    })) {
      expect(nursing.querySelector("[data-own]")).toBeNull();
    }
    const five = screen.getByRole("radio", { name: "5" });
    expect(description(five)).toBe("Not sure Round 1: 5");
    expect(screen.getAllByText("Round 1: 5")).toHaveLength(1);
    expect(description(screen.getByRole("radio", { name: "7" }))).toBe("Belongs in the model");
  });

  it("marks unable to rate when that was the earlier answer", () => {
    renderElement({
      ...LATER,
      previous: { ...LATER.previous, own: { rated: true, score: null, reason: null } },
    });
    openGroupScores();
    expect(description(screen.getByRole("radio", { name: "Unable to rate" }))).toBe("Round 1");
    expect(screen.getByRole("img", { name: /score 9: 3$/ }).querySelector("[data-own]")).toBeNull();
  });

  it("folds how the group scored behind a button beside the own score (ADR 0019)", () => {
    renderElement(LATER);
    const toggle = screen.getByRole("button", { name: "How the group scored in round 1" });
    const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel?.hidden).toBe(true);
    // The button shares a row with the own score; the panel follows that row, so it opens below.
    const row = toggle.parentElement;
    expect(row?.textContent).toContain("Your round 1 score: 5");
    expect(row?.nextElementSibling).toBe(panel);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.hidden).toBe(false);
    expect(row?.contains(toggle)).toBe(true);
  });

  it("puts the question right under the name and description, before the scale", () => {
    renderElement(LATER);
    const question = screen.getByText(
      "Does this element belong in the data model, for any use case in scope?",
    );
    const toggle = screen.getByRole("button", { name: "How the group scored in round 1" });
    const scale = screen.getByRole("radiogroup");
    const follows = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(follows(screen.getByText("The highest pressure in the cycle"), question)).toBe(true);
    expect(follows(question, toggle)).toBe(true);
    expect(follows(toggle, scale)).toBe(true);
  });

  it("shows the help under the reason only while the field has focus", () => {
    renderElement();
    const reason = screen.getByLabelText("Reason (optional)");
    expect(screen.queryByText(/Choose a score or "unable to rate" first/)).toBeNull();
    expect(reason.getAttribute("aria-describedby")).toBeNull();
    fireEvent.focus(reason);
    const help = screen.getByText(/Choose a score or "unable to rate" first/);
    expect(reason.getAttribute("aria-describedby")).toBe(help.id);
    fireEvent.blur(reason);
    expect(screen.queryByText(/Choose a score or "unable to rate" first/)).toBeNull();
  });

  it("shows no marker in the first round", () => {
    renderElement();
    expect(document.querySelector("[data-previous-marker]")).toBeNull();
  });
});

/** Opens the panel with how the group scored in the previous round. */
function openGroupScores(): void {
  fireEvent.click(screen.getByRole("button", { name: /^How the group scored in round/ }));
}

/** The text of the elements that describe `element`, joined by a space. */
function description(element: HTMLElement): string {
  return (element.getAttribute("aria-describedby") ?? "")
    .split(" ")
    .filter(Boolean)
    .map((id) => {
      const node = document.getElementById(id)?.cloneNode(true) as HTMLElement | undefined;
      for (const hidden of node?.querySelectorAll("[aria-hidden='true']") ?? []) hidden.remove();
      return node?.textContent ?? "";
    })
    .join(" ");
}

function renderWithRule(rule: ConsensusRule, element: MyElement = ELEMENT, editable = true) {
  const save = vi.fn(DONE);
  render(
    <RatingElement
      element={element}
      details={DETAILS}
      position={{ index: 1, total: 1 }}
      rule={rule}
      editable={editable}
      save={save}
      clear={vi.fn(DONE)}
      saveFlag={vi.fn(DONE)}
      removeFlag={vi.fn(DONE)}
    />,
  );
  return { save };
}

const bandOf = (band: string) => document.querySelector<HTMLElement>(`[data-band="${band}"]`);
const scoresIn = (band: string) =>
  within(bandOf(band) as HTMLElement)
    .getAllByRole("radio")
    .map((radio) => radio.textContent);

describe("the scale in the round's bands (DE1)", () => {
  it("groups the scores by the rule's bands and names each band under it", () => {
    renderWithRule({ ...DEFAULT_RULE, scaleMin: 0, scaleMax: 10, bottomBandMax: 2, topBandMin: 8 });
    expect(screen.getAllByRole("radio")).toHaveLength(12);
    expect(scoresIn("bottom")).toEqual(["0", "1", "2"]);
    expect(scoresIn("middle")).toEqual(["3", "4", "5", "6", "7"]);
    expect(scoresIn("top")).toEqual(["8", "9", "10"]);
    expect(bandOf("bottom")?.textContent).toContain("Does not belong in the model");
    expect(bandOf("middle")?.textContent).toContain("Not sure");
    expect(bandOf("top")?.textContent).toContain("Belongs in the model");
    expect(screen.getByRole("radio", { name: "0, does not belong in the model" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "10, belongs in the model" })).toBeTruthy();
    expect(description(screen.getByRole("radio", { name: "3" }))).toBe("Not sure");
    // "Unable to rate" stands apart, in no band.
    const unable = screen.getByRole("radio", { name: "Unable to rate" });
    expect(unable.closest("[data-band]")).toBeNull();
    expect(screen.getByText(/Keys: 0 to 9 choose a score/)).toBeTruthy();
  });

  it("leaves the middle band out when the rule has no scores in between", () => {
    renderWithRule({ ...DEFAULT_RULE, scaleMin: 1, scaleMax: 5, bottomBandMax: 2, topBandMin: 3 });
    expect(bandOf("middle")).toBeNull();
    expect(scoresIn("bottom")).toEqual(["1", "2"]);
    expect(scoresIn("top")).toEqual(["3", "4", "5"]);
    expect(screen.queryByText("Not sure")).toBeNull();
    expect(screen.getByText(/Keys: 1 to 5 choose a score/)).toBeTruthy();
  });

  it("hides the keys line on a touch device only", () => {
    renderWithRule(DEFAULT_RULE);
    expect(screen.getByTestId("rating-keys").className.split(" ")).toContain("touch:hidden");
  });

  it("shows the keys line only while the scale has keyboard focus, and always to a screen reader", () => {
    renderWithRule(DEFAULT_RULE);
    const keys = screen.getByTestId("rating-keys");
    const scale = screen.getByRole("radiogroup");
    expect(scale.getAttribute("aria-describedby")).toBe(keys.id);
    expect(keys.className.split(" ")).toContain("sr-only");

    const five = screen.getByRole("radio", { name: "5" });
    const matches = vi.spyOn(five, "matches").mockReturnValue(true);
    fireEvent.focus(five);
    expect(keys.className.split(" ")).not.toContain("sr-only");
    fireEvent.blur(five, { relatedTarget: document.body });
    expect(keys.className.split(" ")).toContain("sr-only");

    matches.mockReturnValue(false);
    fireEvent.focus(five);
    expect(keys.className.split(" ")).toContain("sr-only");
  });

  it("puts the question right above the scale and labels the scale with it", () => {
    renderWithRule(DEFAULT_RULE);
    const scale = screen.getByRole("radiogroup");
    const question = document.getElementById(scale.getAttribute("aria-labelledby") ?? "");
    expect(question?.textContent).toBe(
      "Does this element belong in the data model, for any use case in scope?",
    );
    expect(screen.getByRole("heading", { level: 3 }).className.split(" ")).toContain(
      "type-page-title",
    );
    expect(question?.className.split(" ")).not.toContain("type-page-title");
  });

  it("shows the chosen score filled and with a check, the others without", () => {
    renderWithRule(DEFAULT_RULE, { ...ELEMENT, own: { rated: true, score: 6, reason: null } });
    const six = screen.getByRole("radio", { name: "6" });
    expect(six.getAttribute("aria-checked")).toBe("true");
    expect(six.getAttribute("data-state")).toBe("checked");
    expect(six.querySelector("svg")).toBeTruthy();
    const five = screen.getByRole("radio", { name: "5" });
    expect(five.getAttribute("aria-checked")).toBe("false");
    expect(five.querySelector("svg")).toBeNull();
    // One tab stop for the whole scale; Radix moves focus from it to the chosen option.
    const scale = screen.getByRole("radiogroup");
    const stops = [scale, ...within(scale).getAllByRole("radio")].filter((el) => el.tabIndex === 0);
    expect(stops).toHaveLength(1);
  });
});

describe("the keys of the card (DE18)", () => {
  it("choose a score with a digit and unable to rate with U, and announce the choice", async () => {
    const { save } = renderWithRule(DEFAULT_RULE);
    fireEvent.keyDown(document.body, { key: "7" });
    await waitFor(() => expect(save).toHaveBeenCalledWith(7, ""));
    expect(screen.getByRole("radio", { name: "7" }).getAttribute("aria-checked")).toBe("true");
    expect(await screen.findByText("Saved: 7")).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "U" });
    await waitFor(() => expect(save).toHaveBeenCalledWith(null, ""));
    expect(await screen.findByText("Saved: unable to rate")).toBeTruthy();
  });

  it("save the reason typed so far with the chosen score", async () => {
    const { save } = renderWithRule(DEFAULT_RULE);
    fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Needed" } });
    fireEvent.keyDown(screen.getByRole("heading", { name: "Systolic pressure" }), { key: "4" });
    await waitFor(() => expect(save).toHaveBeenCalledWith(4, "Needed"));
  });

  it("are ignored while typing the reason, with a modifier, or off the scale", async () => {
    const { save } = renderWithRule({
      ...DEFAULT_RULE,
      scaleMin: 1,
      scaleMax: 5,
      bottomBandMax: 2,
      topBandMin: 4,
    });
    const reason = screen.getByLabelText("Reason (optional)");
    fireEvent.keyDown(reason, { key: "3" });
    fireEvent.keyDown(reason, { key: "u" });
    fireEvent.keyDown(document.body, { key: "3", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "7" });
    fireEvent.keyDown(document.body, { key: "0" });
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getAllByRole("radio").every((radio) => radio.getAttribute("aria-checked") === "false"),
    ).toBe(true);
  });

  it("are ignored in the flag form", async () => {
    const { save } = renderWithRule(DEFAULT_RULE);
    fireEvent.click(screen.getByText("Data type, cardinality and values (not rated)"));
    fireEvent.click(screen.getAllByRole("button", { name: /Flag as wrong/ })[0] as HTMLElement);
    const form = document.querySelector("form") as HTMLFormElement;
    fireEvent.keyDown(form, { key: "5" });
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
  });

  it("choose nothing once the round is closed, and the line names only the moves", async () => {
    const { save } = renderWithRule(DEFAULT_RULE, ELEMENT, false);
    fireEvent.keyDown(document.body, { key: "5" });
    await Promise.resolve();
    expect(save).not.toHaveBeenCalled();
    expect(
      screen.getByText("Keys: N goes to the next element and P to the previous one."),
    ).toBeTruthy();
  });
});

describe("RatingElement when closed", () => {
  it("cannot change a rating or flag a detail once the round is no longer open", () => {
    renderElement(ELEMENT, false);
    expect(screen.getByRole("radio", { name: "5" }).hasAttribute("disabled")).toBe(true);
    expect(screen.queryByRole("button", { name: /Flag as wrong/ })).toBeNull();
  });
});
