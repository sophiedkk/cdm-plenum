// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync(new URL("./app.css", import.meta.url), "utf8");

function role(name: string): string {
  const match = new RegExp(`@utility ${name} \\{([\\s\\S]*?)\\n\\}`).exec(css);
  if (!match) throw new Error(`type role ${name} is missing from app.css`);
  return match[1] ?? "";
}

describe("type roles", () => {
  it.each([
    ["type-meta", "0.875rem", "400"],
    ["type-body", "1rem", "400"],
    ["type-section", "1.125rem", "600"],
    ["type-page-title", "1.5rem", "600"],
    ["type-home-card", "1.5rem", "600"],
  ])("%s is %s at weight %s", (name, size, weight) => {
    const body = role(name);
    expect(body).toContain(`font-size: ${size};`);
    expect(body).toContain(`font-weight: ${weight};`);
  });

  it("makes the home card 30 pixels from the small breakpoint", () => {
    expect(role("type-home-card")).toContain("font-size: 1.875rem;");
  });
});
