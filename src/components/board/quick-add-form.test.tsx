// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The brainstorm quick-add form (EL14, EL15): a name and one optional line, Enter adds, the
// form empties and the cursor returns to the name; hints of similar names only when the board is
// revealed (EL13), each with a link to the element.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { Outcome } from "@/lib/forms/outcome";
import { type HintElement, QuickAddForm } from "./quick-add-form";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const BOARD: HintElement[] = [
  { id: "e1", name: "Systolic pressure" },
  { id: "e2", name: "Diastolic pressure" },
  { id: "e3", name: "Cuff size" },
];

function renderForm({
  submit = vi.fn(async () => ({ ok: true, value: null }) as const),
  hintSource = null,
}: {
  submit?: (fields: { name: string; description: string }) => Promise<Outcome<unknown>>;
  hintSource?: readonly HintElement[] | null;
} = {}) {
  const onAdded = vi.fn();
  render(
    <QuickAddForm
      question="What do you record or measure?"
      hintSource={hintSource}
      hintLink={(element) => <a href={`#${element.id}`}>{element.name}</a>}
      submit={submit}
      onAdded={onAdded}
    />,
  );
  const form = screen.getByRole("form", { name: "What do you record or measure?" });
  return {
    submit,
    onAdded,
    form,
    name: within(form).getByLabelText("Element name") as HTMLInputElement,
    line: within(form).getByLabelText("One line, optional") as HTMLInputElement,
  };
}

describe("QuickAddForm", () => {
  it("adds the trimmed name and line on Enter, empties the form and returns to the name", async () => {
    const { submit, onAdded, form, name, line } = renderForm();
    fireEvent.change(name, { target: { value: "  Systolic " } });
    fireEvent.change(line, { target: { value: "Peak pressure " } });
    fireEvent.submit(form);
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("Systolic"));
    expect(submit).toHaveBeenCalledWith({ name: "Systolic", description: "Peak pressure" });
    expect(name.value).toBe("");
    expect(line.value).toBe("");
    await waitFor(() => expect(document.activeElement).toBe(name));
  });

  it("needs only a name", async () => {
    const { submit, onAdded, form, name } = renderForm();
    fireEvent.change(name, { target: { value: "Cuff size" } });
    fireEvent.submit(form);
    await waitFor(() => expect(onAdded).toHaveBeenCalled());
    expect(submit).toHaveBeenCalledWith({ name: "Cuff size", description: "" });
  });

  it("refuses an empty name before calling the server", async () => {
    const { submit, form, name } = renderForm();
    fireEvent.submit(form);
    expect(await screen.findByText("Enter a name for the element.")).toBeTruthy();
    expect(name.getAttribute("aria-invalid")).toBe("true");
    expect(submit).not.toHaveBeenCalled();
  });

  it("shows a server refusal at the top of the form and keeps the text", async () => {
    const submit = vi.fn(async () => ({ ok: false, error: "not_found" }) as const);
    const { onAdded, form, name } = renderForm({ submit });
    fireEvent.change(name, { target: { value: "Systolic" } });
    fireEvent.submit(form);
    expect(await within(form).findByRole("alert")).toBeTruthy();
    expect(form.textContent).toContain("This does not exist, or you have no access to it.");
    expect(name.value).toBe("Systolic");
    expect(onAdded).not.toHaveBeenCalled();
  });

  it("shows the general error when the call fails", async () => {
    const submit = vi.fn(async () => {
      throw new Error("network");
    });
    const { form, name } = renderForm({ submit });
    fireEvent.change(name, { target: { value: "Systolic" } });
    fireEvent.submit(form);
    expect(await within(form).findByRole("alert")).toBeTruthy();
    expect(form.textContent).toContain("Something went wrong on our side. Try again.");
    expect(name.value).toBe("Systolic");
  });

  it("shows no hints before the reveal, however similar the name", () => {
    const { name } = renderForm({ hintSource: null });
    fireEvent.change(name, { target: { value: "Systolic pressure" } });
    expect(screen.queryByRole("list", { name: "Similar elements" })).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("");
  });

  it("lists similar names after the reveal, with a link to each", () => {
    const { name } = renderForm({ hintSource: BOARD });
    fireEvent.change(name, { target: { value: "systolic" } });
    const list = screen.getByRole("list", { name: "Similar elements" });
    const links = within(list).getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Systolic pressure", "#e1"],
    ]);
    expect(screen.getByRole("status").textContent).toContain(
      "Similar elements already on the board: 1",
    );
  });

  it("lists nothing for a name that is too short or not similar", () => {
    const { name } = renderForm({ hintSource: BOARD });
    fireEvent.change(name, { target: { value: "sy" } });
    expect(screen.queryByRole("list", { name: "Similar elements" })).toBeNull();
    fireEvent.change(name, { target: { value: "Heart rate" } });
    expect(screen.queryByRole("list", { name: "Similar elements" })).toBeNull();
  });
});

describe("QuickAddForm, same as a hint (EL16)", () => {
  function renderWithMark(markSame: (element: HintElement) => Promise<Outcome<unknown>>) {
    const submit = vi.fn(async () => ({ ok: true, value: null }) as const);
    const onAdded = vi.fn();
    const onMarkedSame = vi.fn();
    render(
      <QuickAddForm
        question="What do you record or measure?"
        hintSource={BOARD}
        hintLink={(element) => <a href={`#${element.id}`}>{element.name}</a>}
        submit={submit}
        onAdded={onAdded}
        markSame={markSame}
        onMarkedSame={onMarkedSame}
      />,
    );
    const form = screen.getByRole("form", { name: "What do you record or measure?" });
    const name = within(form).getByLabelText("Element name") as HTMLInputElement;
    fireEvent.change(name, { target: { value: "systolic" } });
    return { submit, onAdded, onMarkedSame, form, name };
  }

  it("says what the action does and supports the hinted element instead of adding", async () => {
    const markSame = vi.fn(async () => ({ ok: true, value: null }) as const);
    const { submit, onAdded, onMarkedSame, name } = renderWithMark(markSame);
    expect(screen.getByRole("status").textContent).toContain(
      'Or choose "Same as this": you support that element, and what you typed is not added.',
    );
    const list = screen.getByRole("list", { name: "Similar elements" });
    fireEvent.click(within(list).getByRole("button", { name: "Same as this: Systolic pressure" }));
    await waitFor(() => expect(onMarkedSame).toHaveBeenCalledWith(BOARD[0]));
    expect(markSame).toHaveBeenCalledWith(BOARD[0]);
    expect(submit).not.toHaveBeenCalled();
    expect(onAdded).not.toHaveBeenCalled();
    expect(name.value).toBe("");
  });

  it("shows a refused mark at the top of the form and keeps the text", async () => {
    const markSame = vi.fn(async () => ({ ok: false, error: "phase_closed" }) as const);
    const { onMarkedSame, form, name } = renderWithMark(markSame);
    fireEvent.click(screen.getByRole("button", { name: "Same as this: Systolic pressure" }));
    expect(await within(form).findByRole("alert")).toBeTruthy();
    expect(form.textContent).toContain("This step is closed in the current phase.");
    expect(name.value).toBe("systolic");
    expect(onMarkedSame).not.toHaveBeenCalled();
  });

  it("offers no action when marks are closed", () => {
    const { name } = renderForm({ hintSource: BOARD });
    fireEvent.change(name, { target: { value: "systolic" } });
    expect(screen.queryByRole("button", { name: /Same as this/ })).toBeNull();
    expect(screen.getByRole("status").textContent).toContain("instead of adding a duplicate");
  });
});
