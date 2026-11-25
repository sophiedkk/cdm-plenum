// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { isProjectMode, PROJECT_MODES } from "./project-mode";

describe("project modes (PR14)", () => {
  it("knows the two modes the database allows", () => {
    expect(PROJECT_MODES).toEqual(["delphi", "team"]);
    expect(isProjectMode("team")).toBe(true);
    expect(isProjectMode("anonymous")).toBe(false);
    expect(isProjectMode(null)).toBe(false);
  });
});
