// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The member's own marks on an element (EL16): the "I support this" toggle with its pressed
// state, the "Same as…" choice of the other elements, removing a mark, and the refusals.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type ElementMarkProps, ElementMarks, type MarkTarget } from "./element-marks";

afterEach(cleanup);

const PULSE: MarkTarget = { id: "e2", name: "2. Pulse rate" };
const RHYTHM: MarkTarget = { id: "e3", name: "3. Rhythm" };

function renderMarks(overrides: Partial<ElementMarkProps> = {}) {
  const marks: ElementMarkProps = {
    supported: false,
    sameAs: [],
    candidates: [PULSE, RHYTHM],
    setSupport: vi.fn(async () => ({ ok: true, value: null }) as const),
    addSameAs: vi.fn(async () => ({ ok: true, value: null }) as const),
    removeSameAs: vi.fn(async () => ({ ok: true, value: null }) as const),
    onChanged: vi.fn(),
    ...overrides,
  };
  render(<ElementMarks name="Heart rate" marks={marks} />);
  return { marks, region: screen.getByRole("region", { name: "Your marks on Heart rate" }) };
}

describe("ElementMarks", () => {
  it("shows the support toggle with its pressed state and turns it on", async () => {
    const { marks } = renderMarks();
    const toggle = screen.getByRole("button", { name: "I support this" });
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(toggle);
    await waitFor(() => expect(marks.onChanged).toHaveBeenCalledWith("You support Heart rate."));
    expect(marks.setSupport).toHaveBeenCalledWith(true);
  });

  it("turns a pressed toggle off", async () => {
    const { marks } = renderMarks({ supported: true });
    const toggle = screen.getByRole("button", { name: "I support this" });
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(toggle);
    await waitFor(() =>
      expect(marks.onChanged).toHaveBeenCalledWith("You no longer support Heart rate."),
    );
    expect(marks.setSupport).toHaveBeenCalledWith(false);
  });

  it("shows a refused support as a translated message", async () => {
    const { marks } = renderMarks({
      setSupport: vi.fn(async () => ({ ok: false, error: "marks_before_reveal" }) as const),
    });
    fireEvent.click(screen.getByRole("button", { name: "I support this" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "You can mark elements after the facilitator reveals the board.",
    );
    expect(marks.onChanged).not.toHaveBeenCalled();
  });

  it("needs a choice, then marks the chosen element as the same", async () => {
    const { marks } = renderMarks();
    const select = screen.getByLabelText("Same as…") as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual([
      "Choose an element",
      "2. Pulse rate",
      "3. Rhythm",
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Mark as the same" }));
    expect(await screen.findByText("Choose the element that says the same.")).toBeTruthy();
    expect(marks.addSameAs).not.toHaveBeenCalled();

    fireEvent.change(select, { target: { value: "e2" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark as the same" }));
    await waitFor(() => expect(marks.addSameAs).toHaveBeenCalledWith(PULSE));
    expect(marks.onChanged).toHaveBeenCalledWith(
      "You marked Heart rate as the same as 2. Pulse rate.",
    );
  });

  it("shows a refused same-as mark at the top of the form", async () => {
    renderMarks({
      addSameAs: vi.fn(async () => ({ ok: false, error: "same_as_itself" }) as const),
    });
    fireEvent.change(screen.getByLabelText("Same as…"), { target: { value: "e3" } });
    fireEvent.click(screen.getByRole("button", { name: "Mark as the same" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "An element cannot be the same as itself.",
    );
  });

  it("lists the member's own same-as marks, leaves them out of the choice and removes one", async () => {
    const { marks, region } = renderMarks({ sameAs: [PULSE] });
    const list = within(region).getByRole("list", { name: "You marked this as the same as:" });
    expect(within(list).getByText("2. Pulse rate")).toBeTruthy();
    const select = screen.getByLabelText("Same as…") as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual([
      "Choose an element",
      "3. Rhythm",
    ]);
    fireEvent.click(within(list).getByRole("button", { name: "Remove: 2. Pulse rate" }));
    await waitFor(() => expect(marks.removeSameAs).toHaveBeenCalledWith(PULSE));
    expect(marks.onChanged).toHaveBeenCalledWith(
      "Your mark that Heart rate is the same as 2. Pulse rate is removed.",
    );
  });

  it("shows a failed request as an unexpected error", async () => {
    renderMarks({ setSupport: vi.fn(async () => Promise.reject(new Error("network"))) });
    fireEvent.click(screen.getByRole("button", { name: "I support this" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Something went wrong on our side. Try again.",
    );
  });
});
