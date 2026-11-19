// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Opening a round (DE2, DE12): the dialog says what becomes fixed; below the minimum the server
// answers `reason_required`, and the dialog shows the shortfall and asks for a reason.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { OpenRoundDialog, type OpenRoundOutcome } from "./open-round-dialog";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const SHORT: OpenRoundOutcome = {
  ok: false,
  error: "reason_required",
  shortfall: [{ expertType: "clinical", joined: 0, minimum: 2 }],
};

function openDialog(open: (reason?: string) => Promise<OpenRoundOutcome>) {
  const onOpened = vi.fn();
  render(<OpenRoundDialog number={1} open={open} onOpened={onOpened} />);
  fireEvent.click(screen.getByRole("button", { name: "Open round" }));
  return { onOpened };
}

describe("OpenRoundDialog", () => {
  it("says what becomes fixed and opens a complete panel at once", async () => {
    const open = vi.fn(async () => ({ ok: true, value: { status: "complete" } }) as const);
    const { onOpened } = openDialog(open);
    const dialog = screen.getByRole("dialog", { name: "Open round 1?" });
    expect(dialog.textContent).toContain("the rule, the closing date");
    fireEvent.click(screen.getByRole("button", { name: "Open round" }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith("complete"));
    expect(open).toHaveBeenCalledWith();
  });

  it("asks for a reason with the shortfall when the server requires one", async () => {
    const open = vi.fn(async (reason?: string) =>
      reason === undefined ? SHORT : ({ ok: true, value: { status: "below_minimum" } } as const),
    );
    const { onOpened } = openDialog(open);
    fireEvent.click(screen.getByRole("button", { name: "Open round" }));
    const reason = await screen.findByLabelText("Reason for opening below the minimum");
    expect(screen.getByText("Clinical: 0 joined, the minimum is 2.")).toBeTruthy();
    await waitFor(() => expect(document.activeElement).toBe(reason));

    fireEvent.click(screen.getByRole("button", { name: "Open with this reason" }));
    expect(
      await screen.findByText("Give a reason to open the round below the minimum."),
    ).toBeTruthy();
    expect(open).toHaveBeenCalledTimes(1);

    fireEvent.change(reason, { target: { value: "  A teaching group of four  " } });
    fireEvent.click(screen.getByRole("button", { name: "Open with this reason" }));
    await waitFor(() => expect(onOpened).toHaveBeenCalledWith("below_minimum"));
    expect(open).toHaveBeenLastCalledWith("A teaching group of four");
  });

  it("shows another refusal in the dialog, translated", async () => {
    const open = vi.fn(async () => ({ ok: false, error: "round_has_no_elements" }) as const);
    openDialog(open);
    fireEvent.click(screen.getByRole("button", { name: "Open round" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Add at least one element to the round before you open it.",
    );
  });
});
