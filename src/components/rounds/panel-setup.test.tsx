// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project's own minimum panel (DE13): a count needs a reason, the reason goes to the server
// with the counts, and the saved reason shows next to the class defaults.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { PanelStatus } from "@/server/rounds/queries";
import { type PanelOutcome, PanelSetup } from "./panel-setup";

beforeAll(() => {
  // Radix radio groups measure themselves; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

afterEach(cleanup);

const STATUS: PanelStatus = {
  changeClass: "D",
  classDefault: { clinical: 2, terminology: 1, architecture: 2 },
  overrides: {},
  overridesReason: null,
  minimum: { clinical: 2, terminology: 1, architecture: 2 },
  joined: { clinical: 2, terminology: 1, architecture: 2 },
  shortfall: [],
  locked: false,
};

function renderSetup(
  status: PanelStatus,
  saveMinimum = vi.fn(async () => ({ ok: true }) as PanelOutcome),
  saveChangeClass = vi.fn(async () => ({ ok: true }) as PanelOutcome),
) {
  render(
    <PanelSetup status={status} saveChangeClass={saveChangeClass} saveMinimum={saveMinimum} />,
  );
  return saveMinimum;
}

describe("PanelSetup minimum (DE13)", () => {
  it("asks for a reason before it saves a count of the project's own", async () => {
    const save = renderSetup(STATUS);
    fireEvent.change(screen.getByLabelText("Terminology"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save minimum" }));
    expect(await screen.findByText("Give a reason for the change.")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Reason for the change"), {
      target: { value: "  No terminologist in this course.  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save minimum" }));
    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        { clinical: null, terminology: 0, architecture: null },
        "No terminologist in this course.",
      ),
    );
  });

  it("shows the server's refusal at the reason field", async () => {
    const save = vi.fn(
      async () => ({ ok: false, error: "minimum_reason_required" }) as PanelOutcome,
    );
    renderSetup(STATUS, save);
    fireEvent.change(screen.getByLabelText("Clinical"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Reason for the change"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save minimum" }));
    expect(await screen.findByText("Give a reason for the project's own minimum.")).toBeTruthy();
  });

  it("shows the saved reason, also once the panel is locked", () => {
    renderSetup({
      ...STATUS,
      overrides: { terminology: 0 },
      overridesReason: "No terminologist in this course.",
      locked: true,
    });
    expect(screen.getByText("Reason for the project's own minimum")).toBeTruthy();
    expect(screen.getByText("No terminologist in this course.")).toBeTruthy();
  });
});

describe("PanelSetup summary and change class (F6, F7)", () => {
  it("says in one line that the panel meets the minimum, and opens the table below it", () => {
    renderSetup(STATUS);
    expect(screen.getByText("The panel meets the minimum for every expert type.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
    const toggle = screen.getByRole("button", { name: "Show per expert type" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(screen.getByRole("table")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Hide the table" }).getAttribute("aria-expanded"),
    ).toBe("true");
  });

  it("shows the table at once when an expert type falls short", () => {
    renderSetup({
      ...STATUS,
      joined: { clinical: 1, terminology: 1, architecture: 2 },
      shortfall: [{ expertType: "clinical", joined: 1, minimum: 2 }],
    });
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Show per expert type" })).toBeNull();
  });

  it("saves the change class when you pick it and says so", async () => {
    const saveChangeClass = vi.fn(async () => ({ ok: true }) as PanelOutcome);
    renderSetup(STATUS, undefined, saveChangeClass);
    expect(screen.queryByRole("button", { name: "Save change class" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /^B, small change/ }));
    await waitFor(() => expect(saveChangeClass).toHaveBeenCalledWith("B"));
    expect((await screen.findByRole("status")).textContent).toBe("Saved");
  });

  it("shows a refusal inline and puts the choice back", async () => {
    const saveChangeClass = vi.fn(
      async () => ({ ok: false, error: "panel_locked" }) as PanelOutcome,
    );
    renderSetup(STATUS, undefined, saveChangeClass);
    fireEvent.click(screen.getByRole("radio", { name: /^B, small change/ }));
    const alert = await screen.findByText(/./, { selector: "[role=alert]" });
    expect(alert.textContent?.length).toBeGreaterThan(0);
    expect(
      screen.getByRole("radio", { name: /^D, large change/ }).getAttribute("aria-checked"),
    ).toBe("true");
  });
});
