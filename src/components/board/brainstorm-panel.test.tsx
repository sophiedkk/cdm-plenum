// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's view of the private step (EL13): the counts, and a reveal only after a
// confirmation on the page; a refusal is shown, translated.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { Outcome } from "@/lib/forms/outcome";
import { type ParticipantCount, RevealPanel } from "./brainstorm-panel";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
  vi.clearAllMocks();
});

const PARTICIPANTS: ParticipantCount[] = [
  { memberId: "m1", name: "Invented Nurse", email: "nurse@example.test", elements: 3 },
  { memberId: "m2", name: "", email: "gp@example.test", elements: 0 },
  { memberId: "m3", name: "", email: "doctor@example.test", elements: 2 },
];

function renderPanel(reveal: () => Promise<Outcome<unknown>>) {
  const onRevealed = vi.fn();
  render(<RevealPanel participants={PARTICIPANTS} reveal={reveal} onRevealed={onRevealed} />);
  return { onRevealed };
}

describe("RevealPanel", () => {
  it("says how many participants added how many elements, and lists them", () => {
    renderPanel(vi.fn());
    expect(screen.getByTestId("private-step-status").textContent).toBe(
      "Participants see only their own elements. Elements added by participants: 5, by 2 of 3 participants.",
    );
    const rows = screen.getAllByRole("row").map((row) => row.textContent);
    expect(rows).toEqual([
      "ParticipantElements",
      "Invented Nurse3",
      "gp@example.test0",
      "doctor@example.test2",
    ]);
  });

  it("reveals only after the confirmation", async () => {
    const reveal = vi.fn(async () => ({ ok: true, value: null }) as const);
    const { onRevealed } = renderPanel(reveal);
    fireEvent.click(screen.getByRole("button", { name: "Reveal the board" }));
    expect(screen.getByRole("alertdialog", { name: "Reveal the board to all participants?" }));
    expect(reveal).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, reveal the board" }));
    await waitFor(() => expect(onRevealed).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith(
      "The board is revealed. Participants now see every element.",
    );
  });

  it("changes nothing when the facilitator cancels", () => {
    const reveal = vi.fn();
    renderPanel(reveal);
    fireEvent.click(screen.getByRole("button", { name: "Reveal the board" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(reveal).not.toHaveBeenCalled();
  });

  it("shows the refusal of a board that is already revealed", async () => {
    const reveal = vi.fn(async () => ({ ok: false, error: "board_already_revealed" }) as const);
    const { onRevealed } = renderPanel(reveal);
    fireEvent.click(screen.getByRole("button", { name: "Reveal the board" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, reveal the board" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "The board has already been revealed. The private step cannot change any more.",
      ),
    );
    expect(onRevealed).not.toHaveBeenCalled();
  });
});
