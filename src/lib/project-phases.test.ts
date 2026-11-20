// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { adjacentPhase, isProjectPhase, phaseSteps } from "./project-phases.ts";

describe("adjacentPhase (PR4)", () => {
  it("moves one phase on or back", () => {
    expect(adjacentPhase("scope", "next")).toBe("discover");
    expect(adjacentPhase("decide", "next")).toBe("handoff");
    expect(adjacentPhase("discover", "previous")).toBe("scope");
    expect(adjacentPhase("handoff", "previous")).toBe("decide");
  });

  it("returns null past either end", () => {
    expect(adjacentPhase("scope", "previous")).toBeNull();
    expect(adjacentPhase("handoff", "next")).toBeNull();
  });
});

describe("phaseSteps", () => {
  it("marks the phases before the current one done, and names the next one", () => {
    expect(phaseSteps("discover")).toEqual([
      { phase: "scope", state: "done" },
      { phase: "discover", state: "current" },
      { phase: "decide", state: "next" },
      { phase: "handoff", state: "later" },
    ]);
  });

  it("has no next step in the last phase", () => {
    expect(phaseSteps("handoff").map((step) => step.state)).toEqual([
      "done",
      "done",
      "done",
      "current",
    ]);
  });
});

describe("isProjectPhase", () => {
  it("accepts the four phases only", () => {
    expect(isProjectPhase("decide")).toBe(true);
    expect(isProjectPhase("hand-off")).toBe(false);
    expect(isProjectPhase(3)).toBe(false);
  });
});
