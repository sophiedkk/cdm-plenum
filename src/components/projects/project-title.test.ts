// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The document title of a project page (WCAG 2.4.2), also when the project is missing.
import { describe, expect, it } from "vitest";
import { projectTitle } from "./project-title.ts";

describe("projectTitle", () => {
  it("names the page, the project and the app", () => {
    expect(projectTitle({ project: { name: "Blood pressure" } }, "Scope")).toBe(
      "Scope | Blood pressure | cdm-plenum",
    );
    expect(projectTitle({ project: { name: "Blood pressure" } })).toBe(
      "Blood pressure | cdm-plenum",
    );
  });

  it("says the project was not found when the layout threw notFound()", () => {
    expect(projectTitle({}, "Scope")).toBe("Scope | Project not found | cdm-plenum");
  });
});
