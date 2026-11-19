// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { parseDirection, report } from "./migrate.ts";

describe("parseDirection", () => {
  it("defaults to up and accepts up or down", () => {
    expect(parseDirection([])).toBe("up");
    expect(parseDirection(["up"])).toBe("up");
    expect(parseDirection(["down"])).toBe("down");
  });

  it("refuses anything else", () => {
    expect(parseDirection(["sideways"])).toBeNull();
    expect(parseDirection(["up", "down"])).toBeNull();
  });
});

describe("report", () => {
  it("prints each step and returns 0", () => {
    const lines: string[] = [];
    const code = report(
      { results: [{ migrationName: "0001_auth", direction: "Up", status: "Success" }] },
      (line) => lines.push(line),
    );
    expect(code).toBe(0);
    expect(lines).toEqual(["Up 0001_auth: Success"]);
  });

  it("says when there is nothing to run", () => {
    const lines: string[] = [];
    expect(report({ results: [] }, (line) => lines.push(line))).toBe(0);
    expect(lines).toEqual(["No migrations to run."]);
  });

  it("returns 1 and prints the failure", () => {
    const lines: string[] = [];
    const code = report({ error: new Error("relation exists"), results: [] }, (line) =>
      lines.push(line),
    );
    expect(code).toBe(1);
    expect(lines).toContain("Migration failed: relation exists");
  });
});
