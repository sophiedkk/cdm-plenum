// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The element form (EL1, EL5): the data type picker with both type names and its help text, the
// two-part cardinality, the client checks and the server refusals.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { DATA_TYPES } from "@/lib/data-types";
import { type ElementFields, ElementForm, type ElementOutcome } from "./element-form";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

function renderForm(
  submit: (fields: ElementFields) => Promise<ElementOutcome> = vi.fn(
    async () => ({ ok: true }) as const,
  ),
  initial?: Omit<ElementFields, "source">,
) {
  const onDone = vi.fn();
  render(
    <ElementForm
      withSource={initial === undefined}
      initial={initial}
      submitLabel="Add element"
      submit={submit}
      onDone={onDone}
    />,
  );
  return { submit, onDone, button: screen.getByRole("button", { name: "Add element" }) };
}

describe("ElementForm", () => {
  it("lists not decided and the 17 data types with both type names and when to use each", () => {
    renderForm();
    const group = screen.getByRole("group", { name: "Data type" });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(DATA_TYPES.length + 1);
    expect(screen.getByRole("radio", { name: /Not decided/ })).toHaveProperty("checked", true);
    const boolean = screen.getByRole("radio", { name: /Yes or no/ });
    expect(boolean.closest("label")?.textContent).toContain("DV_BOOLEAN / boolean");
    const help = document.getElementById(boolean.getAttribute("aria-describedby") ?? "");
    expect(help?.textContent).toMatch(/Not for lists such as male or female/);
  });

  it("refuses an empty name and moves focus to it", async () => {
    const { submit, button } = renderForm(vi.fn());
    fireEvent.click(button);
    expect(await screen.findByText("Enter a name for the element.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Name")));
    expect(submit).not.toHaveBeenCalled();
  });

  it("needs both parts of the cardinality, or neither", async () => {
    const { submit, button } = renderForm(vi.fn());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Systolic" } });
    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "1" } });
    fireEvent.click(button);
    expect(await screen.findByText(/Choose both a minimum and a maximum/)).toBeTruthy();
    expect(screen.getByLabelText("Maximum").getAttribute("aria-invalid")).toBe("true");
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses another maximum that is not a whole number of 1 or more", async () => {
    const { submit, button } = renderForm(vi.fn());
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Systolic" } });
    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "number" } });
    fireEvent.change(await screen.findByLabelText("Maximum number"), { target: { value: "0" } });
    fireEvent.click(button);
    expect(await screen.findByText("Enter a whole number of 1 or more.")).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("sends the trimmed fields, the data type key and the cardinality", async () => {
    const { submit, onDone, button } = renderForm();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Systolic " } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Peak" } });
    fireEvent.click(screen.getByRole("radio", { name: /Quantity/ }));
    fireEvent.change(screen.getByLabelText("Minimum"), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Maximum"), { target: { value: "many" } });
    fireEvent.change(screen.getByLabelText(/Where the idea comes from/), {
      target: { value: "Ward form" },
    });
    fireEvent.click(button);
    const sent = {
      name: "Systolic",
      description: "Peak",
      dataType: "quantity",
      cardinality: { min: 1, max: null },
      source: "Ward form",
    };
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(sent));
    expect(submit).toHaveBeenCalledWith(sent);
  });

  it("starts from the element when editing and sends no source", async () => {
    const submit = vi.fn(async () => ({ ok: true }) as const);
    renderForm(submit, {
      name: "Count",
      description: "",
      dataType: "count",
      cardinality: { min: 0, max: 3 },
    });
    expect(screen.queryByLabelText(/Where the idea comes from/)).toBeNull();
    expect(screen.getByRole("radio", { name: /^Count/ })).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Maximum number")).toHaveProperty("value", "3");
    fireEvent.click(screen.getByRole("button", { name: "Add element" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: "Count",
        description: "",
        dataType: "count",
        cardinality: { min: 0, max: 3 },
      }),
    );
  });

  it("shows a server refusal at the top of the form, translated", async () => {
    const submit = vi.fn(async () => ({ ok: false, error: "element_has_values" }) as const);
    renderForm(submit, { name: "Pain", description: "", dataType: "ordinal", cardinality: null });
    fireEvent.click(screen.getByRole("button", { name: "Add element" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "proposed values that do not fit the new data type",
    );
  });

  it("speaks Dutch when the locale is Dutch", () => {
    overwriteGetLocale(() => "nl");
    renderForm();
    expect(screen.getByRole("group", { name: "Datatype" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Ja of nee/ })).toBeTruthy();
  });
});
