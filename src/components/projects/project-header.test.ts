// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Which tab of the facilitator's tabs is current (ADR 0019, PR13).
import { describe, expect, it } from "vitest";
import { currentTab } from "./project-header.tsx";

const ROOT = "/projects/$projectId";

/** A fuzzy route match: the page's route and the project layout above it both match. */
const on = (page: string) => (to: string) => to === page || to === ROOT;

describe("currentTab", () => {
  it("marks no tab on a recap page, which belongs to its phase step", () => {
    expect(currentTab(on(`${ROOT}/recap/$phase`))).toBeNull();
  });

  it("marks Overview on the index and on the pages under it", () => {
    expect(currentTab(on(ROOT))).toBe("overview");
    expect(currentTab(on(`${ROOT}/export`))).toBe("overview");
  });

  it("marks the tab of the page and the tab a page without its own tab sits under", () => {
    expect(currentTab(on(`${ROOT}/rounds`))).toBe("rounds");
    expect(currentTab(on(`${ROOT}/brainstorm`))).toBe("elements");
  });

  it("marks the Project menu on People and Settings, which have no tab (ADR 0022)", () => {
    expect(currentTab(on(`${ROOT}/members`))).toBe("project");
    expect(currentTab(on(`${ROOT}/settings`))).toBe("project");
  });
});
