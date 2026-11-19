// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The merge form (EL5): the element that stays, the duplicates, and the merge refusals.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type MergeCandidate, MergeForm, type MergeOutcome } from "./merge-form";

afterEach(cleanup);

const CANDIDATES: MergeCandidate[] = [
  { id: "e1", name: "1. Systolic" },
  { id: "e2", name: "2. Systolic pressure" },
  { id: "e3", name: "3. Diastolic" },
];

function renderForm(merge: (intoId: string, fromIds: string[]) => Promise<MergeOutcome>) {
  const onMerged = vi.fn();
  render(<MergeForm candidates={CANDIDATES} merge={merge} onMerged={onMerged} />);
  return { onMerged, submit: screen.getByRole("button", { name: "Merge" }) };
}

describe("MergeForm", () => {
  it("needs the element to keep and at least one duplicate", async () => {
    const merge = vi.fn();
    const { submit } = renderForm(merge);
    fireEvent.click(submit);
    expect(await screen.findByText("Choose the element to keep.")).toBeTruthy();
    expect(screen.getByText("Choose at least one duplicate.")).toBeTruthy();
    expect(merge).not.toHaveBeenCalled();
  });

  it("leaves the element to keep out of the duplicates and sends both", async () => {
    const merge = vi.fn(async () => ({ ok: true }) as const);
    const { submit, onMerged } = renderForm(merge);
    fireEvent.change(screen.getByLabelText("Element to keep"), { target: { value: "e1" } });
    expect(screen.queryByRole("checkbox", { name: "1. Systolic" })).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: "2. Systolic pressure" }));
    fireEvent.click(submit);
    await waitFor(() => expect(merge).toHaveBeenCalledWith("e1", ["e2"]));
    expect(onMerged).toHaveBeenCalledWith(CANDIDATES[0]);
  });

  it.each([
    ["element_in_round", "One of these elements is in a rating round"],
    ["merge_values_conflict", "The proposed values do not fit the data type"],
  ] as const)("shows the refusal %s, translated", async (error, text) => {
    const { submit } = renderForm(vi.fn(async () => ({ ok: false, error }) as const));
    fireEvent.change(screen.getByLabelText("Element to keep"), { target: { value: "e3" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "1. Systolic" }));
    fireEvent.click(submit);
    expect((await screen.findByRole("alert")).textContent).toContain(text);
  });
});
