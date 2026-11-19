// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The proposed values editor (EL9): numbers per data type, keyboard-operable order, refusals.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DataTypeKey } from "@/lib/data-types";
import { type ProposedValue, parseValueNumber, ValuesForm, type ValuesOutcome } from "./values-form";

afterEach(cleanup);

function renderForm(
  dataType: DataTypeKey,
  initial: ProposedValue[],
  save: (values: ProposedValue[]) => Promise<ValuesOutcome> = vi.fn(async () => ({ ok: true }) as const),
) {
  const onSaved = vi.fn();
  render(<ValuesForm dataType={dataType} initial={initial} save={save} onSaved={onSaved} />);
  return { save, onSaved, submit: screen.getByRole("button", { name: "Save values" }) };
}

describe("parseValueNumber", () => {
  it("reads whole numbers, decimals with a point or a comma, and negatives", () => {
    expect(parseValueNumber("2")).toBe(2);
    expect(parseValueNumber("0,5")).toBe(0.5);
    expect(parseValueNumber(" -1.25 ")).toBe(-1.25);
    expect(parseValueNumber("two")).toBeNull();
    expect(parseValueNumber("")).toBeNull();
  });
});

describe("ValuesForm", () => {
  it("has no number field for coded text and sends the values in order", async () => {
    const { save, submit } = renderForm("coded_text", [{ text: "Left", value: null }]);
    expect(screen.queryByLabelText("Number of value 1")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add value" }));
    const second = await screen.findByLabelText("Text of value 2");
    await waitFor(() => expect(document.activeElement).toBe(second));
    fireEvent.change(second, { target: { value: "Right" } });
    fireEvent.click(screen.getByRole("button", { name: "Move value 2 up" }));
    fireEvent.click(submit);
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith([
        { text: "Right", value: null },
        { text: "Left", value: null },
      ]),
    );
  });

  it("needs a whole number for an ordinal value", async () => {
    const { save, submit } = renderForm("ordinal", [{ text: "Mild", value: null }]);
    fireEvent.change(screen.getByLabelText("Number of value 1"), { target: { value: "1.5" } });
    fireEvent.click(submit);
    expect(await screen.findByText("Enter a whole number.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("needs a number for a scale value and reads a decimal comma", async () => {
    const { save, submit } = renderForm("scale", [{ text: "Very slight", value: null }]);
    fireEvent.click(submit);
    expect(await screen.findByText("Enter a number.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Number of value 1"), { target: { value: "0,5" } });
    fireEvent.click(submit);
    await waitFor(() => expect(save).toHaveBeenCalledWith([{ text: "Very slight", value: 0.5 }]));
  });

  it("needs a text for each value", async () => {
    const { save, submit } = renderForm("coded_text", [{ text: "", value: null }]);
    fireEvent.click(submit);
    expect(await screen.findByText("Enter a text for the value.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("removes a value and shows a server refusal, translated", async () => {
    const save = vi.fn(async () => ({ ok: false, error: "values_not_allowed" }) as const);
    const { submit } = renderForm(
      "coded_text",
      [
        { text: "A", value: null },
        { text: "B", value: null },
      ],
      save,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove value 1" }));
    fireEvent.click(submit);
    await waitFor(() => expect(save).toHaveBeenCalledWith([{ text: "B", value: null }]));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Only coded text, ordinal and scale elements have proposed values.",
    );
  });
});
