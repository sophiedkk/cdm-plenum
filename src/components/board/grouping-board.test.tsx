// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The grouping board in its read view (finished phase): lists only, nothing to pick, move or rename.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { GroupingBoard as Board } from "@/server/elements/groups";
import { GroupingBoard } from "./grouping-board";

afterEach(cleanup);

const BOARD: Board = {
  groups: [
    {
      id: "g1",
      name: "Measurement",
      prompt: null,
      elements: [{ id: "e1", name: "Systolic" }],
    },
  ],
  ungrouped: [{ id: "e2", name: "Cuff size" }],
  checkAskedAt: null,
  remarks: { elsewhere: { e1: 2 }, missing: {} },
  participants: 3,
  checked: 0,
};

function renderBoard(readOnly: boolean) {
  const actions = { move: vi.fn(), rename: vi.fn(), onChanged: vi.fn() };
  render(<GroupingBoard board={BOARD} actions={actions} readOnly={readOnly} />);
}

describe("GroupingBoard", () => {
  it("lets the facilitator pick a card and rename a group while it is open", () => {
    renderBoard(false);
    fireEvent.click(screen.getByRole("button", { name: /Systolic/ }));
    expect(screen.getByRole("button", { name: /Move Systolic here/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Rename/ })).toBeTruthy();
  });

  it("reads as lists with no card, move or rename control when read only", () => {
    renderBoard(true);
    expect(screen.getByText("Systolic")).toBeTruthy();
    expect(screen.getByText("Cuff size")).toBeTruthy();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/2/)).toBeTruthy();
  });
});
