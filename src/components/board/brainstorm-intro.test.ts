// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The brainstorm intro mentions cards from existing models only when there are some (A6).
import { describe, expect, it } from "vitest";
import type { BoardColumn } from "@/server/elements/brainstorm-board";
import { brainstormIntro } from "./brainstorm-intro.ts";

function column(fromModels: number): BoardColumn {
  return {
    prompt: "recorded",
    fromModels: Array.from({ length: fromModels }, (_, index) => ({
      id: `e${index}`,
      name: `Card ${index}`,
      description: "",
      reference: null,
    })),
    own: [],
    others: [],
    hidden: 0,
  } as unknown as BoardColumn;
}

describe("brainstormIntro", () => {
  it("leaves out the sentence about existing models when no card comes from one", () => {
    const intro = brainstormIntro({ columns: [column(0), column(0)], privateStep: true });
    expect(intro).not.toContain("existing models");
    expect(intro).not.toContain("dashed");
    expect(intro).toContain("Only you see your cards");
  });

  it("names imported cards by their label, not by their shape", () => {
    const intro = brainstormIntro({ columns: [column(0), column(2)], privateStep: false });
    expect(intro).toMatch(/^The cards under "From existing models"/);
    expect(intro).not.toContain("dashed");
    expect(intro).toContain("Everyone sees every card");
  });
});
