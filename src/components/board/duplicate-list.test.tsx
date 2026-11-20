// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's possible duplicates (EL16): collapsed with the count, each pair with its
// number of marks and a merge action with both elements (EL5).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DuplicateList, type DuplicatePair } from "./duplicate-list";

afterEach(cleanup);

const PAIRS: DuplicatePair[] = [
  { first: { id: "e1", name: "1. Heart rate" }, second: { id: "e2", name: "2. Pulse" }, count: 2 },
  { first: { id: "e1", name: "1. Heart rate" }, second: { id: "e3", name: "3. Rhythm" }, count: 1 },
];

describe("DuplicateList", () => {
  it("shows nothing without a proposed pair", () => {
    const { container } = render(<DuplicateList pairs={[]} onMerge={vi.fn()} />);
    expect(container.textContent).toBe("");
  });

  it("opens the list of pairs with their counts and merges a pair", () => {
    const onMerge = vi.fn();
    render(<DuplicateList pairs={PAIRS} onMerge={onMerge} />);
    const toggle = screen.getByRole("button", { name: "Possible duplicates (2)" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("list")).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    const items = within(screen.getByRole("list")).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "1. Heart rate and 2. PulseMarked by 2Merge…: 1. Heart rate and 2. Pulse",
      "1. Heart rate and 3. RhythmMarked by 1Merge…: 1. Heart rate and 3. Rhythm",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Merge…: 1. Heart rate and 2. Pulse" }));
    expect(onMerge).toHaveBeenCalledWith(PAIRS[0]);
  });
});
