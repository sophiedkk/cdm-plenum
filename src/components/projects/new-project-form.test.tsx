// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The form pattern on its real use, the new project form (PR2): labelled field, error text
// linked with aria-describedby, focus to the first invalid field, server refusals in the form.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { ProjectMode } from "@/lib/project-mode";
import { type CreateProjectOutcome, NewProjectForm } from "./new-project-form";

// The radio group measures itself; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

function renderForm(create: (name: string, mode: ProjectMode) => Promise<CreateProjectOutcome>) {
  const onCreated = vi.fn();
  render(<NewProjectForm create={create} onCreated={onCreated} />);
  return {
    onCreated,
    input: screen.getByLabelText("Project name"),
    submit: screen.getByRole("button", { name: "Create project" }),
  };
}

describe("NewProjectForm", () => {
  it("links the help text to the field before anything is wrong", () => {
    const { input } = renderForm(vi.fn());
    expect(input.getAttribute("aria-invalid")).toBe("false");
    const describedBy = input.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(describedBy)?.textContent).toMatch(/At most 120 characters/);
  });

  it("shows the error of an empty name, linked to the field, and moves focus there", async () => {
    const create = vi.fn();
    const { input, submit } = renderForm(create);
    fireEvent.click(submit);
    const error = await screen.findByText("Enter a name for the project.");
    expect(input.getAttribute("aria-invalid")).toBe("true");
    const ids = (input.getAttribute("aria-describedby") ?? "").split(" ");
    expect(ids).toContain(error.closest("[id]")?.id);
    await waitFor(() => expect(document.activeElement).toBe(input));
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a name that is only spaces", async () => {
    const create = vi.fn();
    const { input, submit } = renderForm(create);
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(submit);
    expect(await screen.findByText("Enter a name for the project.")).toBeTruthy();
    expect(create).not.toHaveBeenCalled();
  });

  it("shows a server refusal at the top of the form, translated and focused", async () => {
    const create = vi.fn(async () => ({ ok: false, error: "forbidden" }) as const);
    const { input, submit } = renderForm(create);
    fireEvent.change(input, { target: { value: "Blood pressure" } });
    fireEvent.click(submit);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your role does not allow this.");
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it("shows the general error when the call fails", async () => {
    const create = vi.fn(async () => {
      throw new Error("network");
    });
    const { input, submit } = renderForm(create);
    fireEvent.change(input, { target: { value: "Blood pressure" } });
    fireEvent.click(submit);
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Something went wrong on our side.",
    );
  });

  it("sends the trimmed name and hands the new project on", async () => {
    const create = vi.fn(async () => ({ ok: true, value: { projectId: "p-1" } }) as const);
    const { input, submit, onCreated } = renderForm(create);
    fireEvent.change(input, { target: { value: "  Blood pressure " } });
    fireEvent.click(submit);
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("p-1", "Blood pressure"));
    expect(create).toHaveBeenCalledWith("Blood pressure", "delphi");
  });

  it("offers the Delphi study preselected and sends a Team when it is picked (PR14)", async () => {
    const create = vi.fn(async () => ({ ok: true, value: { projectId: "p-1" } }) as const);
    const { input, submit, onCreated } = renderForm(create);
    const group = screen.getByRole("radiogroup", { name: "How the project runs" });
    const delphi = within(group).getByRole("radio", { name: /Delphi study/ });
    expect(delphi.getAttribute("aria-checked")).toBe("true");
    expect(
      within(group).getByText("Anonymous ratings on a scale of 1 to 9 against a consensus rule."),
    ).toBeTruthy();
    fireEvent.click(within(group).getByRole("radio", { name: /Team/ }));
    fireEvent.change(input, { target: { value: "Blood pressure" } });
    fireEvent.click(submit);
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
    expect(create).toHaveBeenCalledWith("Blood pressure", "team");
  });

  it("speaks Dutch when the locale is Dutch", async () => {
    overwriteGetLocale(() => "nl");
    render(<NewProjectForm create={vi.fn()} onCreated={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Project maken" }));
    expect(await screen.findByText("Vul een naam in voor het project.")).toBeTruthy();
  });
});
