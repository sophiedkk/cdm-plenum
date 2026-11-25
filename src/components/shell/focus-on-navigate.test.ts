// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { pageHeadingSelectors } from "./focus-on-navigate";

describe("pageHeadingSelectors", () => {
  it("prefers the project name on a project's home", () => {
    expect(pageHeadingSelectors("/projects/abc")[0]).toContain("h1");
    expect(pageHeadingSelectors("/projects/abc/")[0]).toContain("h1");
  });

  it("prefers the page's h2 on every other page", () => {
    expect(pageHeadingSelectors("/projects/abc/scope")[0]).toContain("h2");
    expect(pageHeadingSelectors("/projects")[0]).toContain("h2");
  });
});
