// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The units field of the structure proposal (DT1, issue #71): only for a quantity or a quantity
// interval, typed as UCUM codes separated by spaces, the first preferred.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { DetailStructure } from "@/lib/details";
import { ProposalForm } from "./proposal-form";

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = () => {};
  Element.prototype.hasPointerCapture = () => false;
});

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const LABEL = /^Units: UCUM codes/;

const QUANTITY: DetailStructure = {
  dataType: "quantity",
  cardinality: { min: 1, max: 1 },
  values: [],
  units: ["mm[Hg]", "kPa"],
};

function renderForm(
  initial: DetailStructure,
  submit = vi.fn(async (_structure: DetailStructure) => ({ ok: true, value: null }) as const),
) {
  render(<ProposalForm initial={initial} submitLabel="Save" submit={submit} onDone={vi.fn()} />);
  return submit;
}

describe("ProposalForm units", () => {
  it("shows the units of a quantity in one field and sends them in order", async () => {
    const submit = renderForm(QUANTITY);
    const field = screen.getByLabelText(LABEL) as HTMLInputElement;
    expect(field.value).toBe("mm[Hg] kPa");
    fireEvent.change(field, { target: { value: "  kPa   /min " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[0]).toMatchObject({
      dataType: "quantity",
      units: ["kPa", "/min"],
    });
  });

  it("shows no units field for another data type and sends none", async () => {
    const submit = renderForm({ ...QUANTITY, dataType: "count", units: [] });
    expect(screen.queryByLabelText(LABEL)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ units: [] });
  });

  it("asks for at least one unit of a quantity", async () => {
    const submit = renderForm({ ...QUANTITY, units: [] });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Fill in at least one unit.")).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses a unit with characters outside printable ASCII, and a repeated unit", async () => {
    const submit = renderForm(QUANTITY);
    const field = screen.getByLabelText(LABEL);
    fireEvent.change(field, { target: { value: "µg" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/^Use UCUM codes without spaces/)).toBeTruthy();
    fireEvent.change(field, { target: { value: "kPa kPa" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Each unit can appear once.")).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("names the field in Dutch", () => {
    overwriteGetLocale(() => "nl");
    renderForm(QUANTITY);
    expect(screen.getByLabelText(/^Eenheden: UCUM-codes/)).toBeTruthy();
  });
});
