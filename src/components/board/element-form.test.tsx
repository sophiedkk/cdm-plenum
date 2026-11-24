// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The element form (EL1, EL5, EL21): adding asks for a name and a description only; editing has
// the data type picker with both type names and its help text and the two-part cardinality while
// the phase shows them, and keeps their saved values otherwise; the client checks and the server
// refusals.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { DATA_TYPES } from "@/lib/data-types";
import { type ElementFields, ElementForm, type ElementOutcome } from "./element-form";

// The Radix checkbox of "refers to another model" measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const EMPTY: ElementFields = {
  name: "",
  description: "",
  dataType: null,
  cardinality: null,
  reference: null,
};

/** The facilitator's edit form, which holds every field (EL5). */
function renderForm(
  submit: (fields: ElementFields) => Promise<ElementOutcome> = vi.fn(
    async () => ({ ok: true }) as const,
  ),
  initial: ElementFields = EMPTY,
  mode: "add" | "edit" = "edit",
  detailFields = true,
) {
  const onDone = vi.fn();
  render(
    <ElementForm
      mode={mode}
      detailFields={detailFields}
      initial={initial}
      submitLabel="Add element"
      submit={submit}
      onDone={onDone}
    />,
  );
  return { submit, onDone, button: screen.getByRole("button", { name: "Add element" }) };
}

describe("ElementForm", () => {
  it("asks only for a name and a description when adding (EL1)", async () => {
    const { submit, onDone, button } = renderForm(undefined, EMPTY, "add");
    expect(screen.queryByRole("group", { name: "Data type" })).toBeNull();
    expect(screen.queryByLabelText("Minimum")).toBeNull();
    expect(screen.queryByLabelText("Maximum")).toBeNull();
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Systolic " } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Peak" } });
    fireEvent.click(button);
    const sent = {
      name: "Systolic",
      description: "Peak",
      dataType: null,
      cardinality: null,
      reference: null,
    };
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(sent));
    expect(submit).toHaveBeenCalledWith(sent);
  });

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
    fireEvent.click(button);
    const sent = {
      name: "Systolic",
      description: "Peak",
      dataType: "quantity",
      cardinality: { min: 1, max: null },
      reference: null,
    };
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(sent));
    expect(submit).toHaveBeenCalledWith(sent);
  });

  it("starts from the element when editing", async () => {
    const submit = vi.fn(async () => ({ ok: true }) as const);
    renderForm(submit, {
      name: "Count",
      description: "",
      dataType: "count",
      cardinality: { min: 0, max: 3 },
      reference: null,
    });
    expect(screen.getByRole("radio", { name: /^Count/ })).toHaveProperty("checked", true);
    expect(screen.getByLabelText("Maximum number")).toHaveProperty("value", "3");
    fireEvent.click(screen.getByRole("button", { name: "Add element" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: "Count",
        description: "",
        dataType: "count",
        cardinality: { min: 0, max: 3 },
        reference: null,
      }),
    );
  });

  it("asks only for a name and a description while the phase hides the details, and keeps them (EL21)", async () => {
    const submit = vi.fn(async () => ({ ok: true }) as const);
    const initial: ElementFields = {
      name: "Count",
      description: "",
      dataType: "count",
      cardinality: { min: 0, max: 3 },
      reference: null,
    };
    renderForm(submit, initial, "edit", false);
    expect(screen.getAllByRole("textbox")).toHaveLength(2);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByText("Cardinality")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add element" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith(initial));
  });

  it("shows a server refusal at the top of the form, translated", async () => {
    const submit = vi.fn(async () => ({ ok: false, error: "element_has_values" }) as const);
    renderForm(submit, {
      name: "Pain",
      description: "",
      dataType: "ordinal",
      cardinality: null,
      reference: null,
    });
    fireEvent.click(screen.getByRole("button", { name: "Add element" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "proposed values that do not fit the new data type",
    );
  });

  it("opens the model's title and link below the choice and sends a reference without a data type (EL26)", async () => {
    const { submit, onDone, button } = renderForm(undefined, EMPTY, "add");
    expect(screen.queryByLabelText("Title of the model")).toBeNull();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Blood pressure" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Refers to another model" }));
    fireEvent.change(await screen.findByLabelText("Title of the model"), {
      target: { value: " Zib Bloeddruk " },
    });
    fireEvent.change(screen.getByLabelText("Link to the model (optional)"), {
      target: { value: "https://models.example.test/bloeddruk" },
    });
    fireEvent.click(button);
    const sent = {
      name: "Blood pressure",
      description: "",
      dataType: null,
      cardinality: null,
      reference: { title: "Zib Bloeddruk", url: "https://models.example.test/bloeddruk" },
    };
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(sent));
    expect(submit).toHaveBeenCalledWith(sent);
  });

  it("hides the data type of a reference and keeps its cardinality (EL26)", async () => {
    const submit = vi.fn(async () => ({ ok: true }) as const);
    renderForm(submit, {
      ...EMPTY,
      name: "Blood pressure",
      cardinality: { min: 0, max: 1 },
      reference: { title: "Zib Bloeddruk", url: null },
    });
    const choice = screen.getByRole("checkbox", { name: "Refers to another model" });
    expect(choice.getAttribute("aria-checked")).toBe("true");
    expect((screen.getByLabelText("Title of the model") as HTMLInputElement).value).toBe(
      "Zib Bloeddruk",
    );
    expect(screen.queryByRole("group", { name: "Data type" })).toBeNull();
    expect(screen.getByLabelText("Minimum")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add element" }));
    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        name: "Blood pressure",
        description: "",
        dataType: null,
        cardinality: { min: 0, max: 1 },
        reference: { title: "Zib Bloeddruk", url: null },
      }),
    );
  });

  it("needs the model's title and an http or https link (EL26)", async () => {
    const { submit, button } = renderForm(vi.fn(), EMPTY, "add");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Blood pressure" } });
    fireEvent.click(screen.getByRole("checkbox", { name: "Refers to another model" }));
    fireEvent.change(await screen.findByLabelText("Link to the model (optional)"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(button);
    expect(await screen.findByText("Give the title of the model.")).toBeTruthy();
    expect(screen.getByText(/starts with http:\/\/ or https:\/\//)).toBeTruthy();
    expect(submit).not.toHaveBeenCalled();
  });

  it("shows the refusal of a reference with a data type, translated (EL26)", async () => {
    const submit = vi.fn(async () => ({ ok: false, error: "reference_data_type" }) as const);
    renderForm(submit, {
      ...EMPTY,
      name: "Blood pressure",
      reference: { title: "Zib", url: null },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add element" }));
    expect((await screen.findByRole("alert")).textContent).toContain("has no data type of its own");
  });

  it("speaks Dutch when the locale is Dutch", () => {
    overwriteGetLocale(() => "nl");
    renderForm();
    expect(screen.getByRole("group", { name: "Datatype" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: /Ja of nee/ })).toBeTruthy();
  });
});
