// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  CHANGE_CLASSES,
  checkOpenRound,
  DEFAULT_CHANGE_CLASS,
  MINIMUM_PANEL,
  minimumPanel,
  panelShortfall,
} from "./panel";

describe("MINIMUM_PANEL", () => {
  it("holds the minimum of the Nictiz agreements per change class", () => {
    expect(CHANGE_CLASSES).toEqual(["A", "B", "C", "D"]);
    expect(MINIMUM_PANEL.A).toEqual({ clinical: 1, terminology: 0, architecture: 1 });
    expect(MINIMUM_PANEL.B).toEqual({ clinical: 2, terminology: 1, architecture: 1 });
    expect(MINIMUM_PANEL.C).toEqual({ clinical: 2, terminology: 1, architecture: 2 });
    expect(MINIMUM_PANEL.D).toEqual({ clinical: 2, terminology: 1, architecture: 2 });
  });

  it("defaults to class D, a new model", () => {
    expect(DEFAULT_CHANGE_CLASS).toBe("D");
  });
});

describe("minimumPanel", () => {
  it("returns the class default without overrides", () => {
    expect(minimumPanel("B")).toEqual(MINIMUM_PANEL.B);
  });

  it("replaces only the expert types the project adjusted (DE13)", () => {
    expect(minimumPanel("D", { architecture: 0 })).toEqual({
      clinical: 2,
      terminology: 1,
      architecture: 0,
    });
  });

  it("does not change the class table", () => {
    minimumPanel("D", { clinical: 5 });
    expect(MINIMUM_PANEL.D.clinical).toBe(2);
  });

  it("throws on a negative or fractional count", () => {
    expect(() => minimumPanel("D", { clinical: -1 })).toThrow("minimum for clinical");
    expect(() => minimumPanel("D", { terminology: 0.5 })).toThrow("minimum for terminology");
  });
});

describe("panelShortfall", () => {
  it("is empty for a complete panel", () => {
    expect(
      panelShortfall({ clinical: 3, terminology: 1, architecture: 2 }, MINIMUM_PANEL.D),
    ).toEqual([]);
  });

  it("lists each expert type below its minimum, counting a missing type as zero", () => {
    expect(panelShortfall({ clinical: 1 }, MINIMUM_PANEL.D)).toEqual([
      { expertType: "clinical", joined: 1, minimum: 2 },
      { expertType: "terminology", joined: 0, minimum: 1 },
      { expertType: "architecture", joined: 0, minimum: 2 },
    ]);
  });
});

describe("checkOpenRound (DE12)", () => {
  const short = { clinical: 2, terminology: 0, architecture: 2 };

  it("opens a complete panel without a reason", () => {
    expect(
      checkOpenRound({ clinical: 2, terminology: 1, architecture: 2 }, MINIMUM_PANEL.D, undefined),
    ).toEqual({ status: "complete" });
  });

  it("asks for a reason below the minimum, also for a blank one", () => {
    expect(checkOpenRound(short, MINIMUM_PANEL.D, undefined).status).toBe("reason_required");
    expect(checkOpenRound(short, MINIMUM_PANEL.D, "   ").status).toBe("reason_required");
  });

  it("opens below the minimum with a reason, never refusing for the panel alone", () => {
    expect(checkOpenRound(short, MINIMUM_PANEL.D, " No terminologist in this course ")).toEqual({
      status: "below_minimum",
      shortfall: [{ expertType: "terminology", joined: 0, minimum: 1 }],
      reason: "No terminologist in this course",
    });
  });
});
