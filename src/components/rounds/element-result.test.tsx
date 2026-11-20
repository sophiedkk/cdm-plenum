// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The compact results of a closed round (DE5, Q-USE-1, Q-ACC-2, Q-PRIV-3): one row per element
// with the outcome in words, the median, a small distribution named by its counts and the
// answers; "Details" opens every score and the result per stakeholder group of 3 or more.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { DEFAULT_RULE, elementResult } from "@/lib/consensus";
import type { ResultRowElement } from "./element-result";
import { ResultsTable } from "./element-result";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const SYSTOLIC: ResultRowElement = {
  id: "e-1",
  name: "Systolic pressure",
  outcome: "included",
  result: elementResult([7, 8, 8, 9, 9, null], DEFAULT_RULE),
  groups: [
    { groupId: "g-1", groupName: "Nursing", result: elementResult([8, 9, 9], DEFAULT_RULE) },
    // Two scores: a group below the minimum must never show, even when it is passed in.
    { groupId: "g-2", groupName: "Architecture", result: elementResult([7, 8], DEFAULT_RULE) },
  ],
};

const CUFF: ResultRowElement = {
  id: "e-2",
  name: "Cuff size",
  outcome: "no_consensus",
  result: elementResult([2, 9], DEFAULT_RULE),
  groups: [],
};

function row(name: string): HTMLElement {
  const header = screen.getByRole("rowheader", { name });
  const found = header.closest("tr");
  if (!found) throw new Error(`no row for ${name}`);
  return found;
}

describe("ResultsTable", () => {
  it("shows one row per element with the outcome in words, median, distribution and answers", () => {
    render(<ResultsTable elements={[SYSTOLIC, CUFF]} />);
    const systolic = row("Systolic pressure");
    expect(within(systolic).getByText("In the archetype")).toBeTruthy();
    expect(within(systolic).getByRole("cell", { name: "8" })).toBeTruthy();
    expect(
      within(systolic).getByRole("img", {
        name: "Distribution of the scores: score 7: 1, score 8: 2, score 9: 2",
      }),
    ).toBeTruthy();
    expect(systolic.textContent).toContain("5 scores, 1 unable to rate");
    const cuff = row("Cuff size");
    expect(within(cuff).getByText("No consensus")).toBeTruthy();
    expect(within(cuff).getByRole("cell", { name: "5.5" })).toBeTruthy();
  });

  it("keeps the details closed until asked, then shows every score and the groups of 3 or more", () => {
    render(<ResultsTable elements={[SYSTOLIC, CUFF]} />);
    const toggle = screen.getByRole("button", { name: "Details for Systolic pressure" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("table", { name: "Scores for Systolic pressure" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const details = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(details?.hidden).toBe(false);
    const scores = screen.getByRole("table", { name: "Scores for Systolic pressure" });
    expect(within(scores).getAllByRole("row")).toHaveLength(10);
    const groups = screen.getByRole("table", {
      name: "Results per stakeholder group for Systolic pressure",
    });
    expect(within(groups).getByRole("rowheader", { name: "Nursing" })).toBeTruthy();
    expect(within(groups).queryByText("Architecture")).toBeNull();
    expect(within(groups).getByText("In the archetype")).toBeTruthy();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(details?.hidden).toBe(true);
  });

  it("names every outcome in words next to its icon, in English and Dutch (Q-ACC-2)", () => {
    const LOW: ResultRowElement = {
      ...CUFF,
      id: "e-3",
      name: "Cuff colour",
      outcome: "excluded",
      result: elementResult([1, 2, 2, 3], DEFAULT_RULE),
    };
    const expected = {
      en: ["In the archetype", "No consensus", "Not in this archetype"],
      nl: ["In het archetype", "Geen consensus", "Niet in dit archetype"],
    } as const;
    for (const locale of ["en", "nl"] as const) {
      overwriteGetLocale(() => locale);
      render(<ResultsTable elements={[SYSTOLIC, CUFF, LOW]} />);
      const [included, noConsensus, excluded] = expected[locale];
      for (const [name, label] of [
        ["Systolic pressure", included],
        ["Cuff size", noConsensus],
        ["Cuff colour", excluded],
      ] as const) {
        const badge = within(row(name)).getByText(label);
        expect(badge.closest("[data-slot=badge]")?.querySelector("svg")).toBeTruthy();
      }
      cleanup();
    }
  });

  it("says why no group shows when no group has 3 scores", () => {
    render(<ResultsTable elements={[CUFF]} />);
    fireEvent.click(screen.getByRole("button", { name: "Details for Cuff size" }));
    expect(screen.getByText(/No stakeholder group has 3 or more scores/)).toBeTruthy();
    expect(screen.queryByRole("table", { name: /per stakeholder group/ })).toBeNull();
  });

  it("names an element without scores as such", () => {
    render(
      <ResultsTable
        elements={[{ ...CUFF, result: elementResult([null], DEFAULT_RULE), groups: [] }]}
      />,
    );
    const cuff = row("Cuff size");
    expect(within(cuff).getByRole("img", { name: "No scores" })).toBeTruthy();
    // The median cell and the distribution cell.
    expect(within(cuff).getAllByRole("cell", { name: "No scores" })).toHaveLength(2);
  });
});
