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
) {
  render(
    <PanelSetup
      status={status}
      saveChangeClass={vi.fn(async () => ({ ok: true }) as PanelOutcome)}
      saveMinimum={saveMinimum}
    />,
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
