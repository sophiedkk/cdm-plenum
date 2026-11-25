// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A table that scrolls sideways is a named region the keyboard can reach (A1, WCAG 2.1.1); a
// table that fits adds no tab stop.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Table, TableBody, TableCell, TableRow } from "./table";

afterEach(cleanup);

function stubWidths(scrollWidth: number, clientWidth: number) {
  globalThis.ResizeObserver = class {
    callback: () => void;
    constructor(callback: () => void) {
      this.callback = callback;
    }
    observe() {
      this.callback();
    }
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
  Object.defineProperty(HTMLElement.prototype, "scrollWidth", {
    configurable: true,
    get: () => scrollWidth,
  });
  Object.defineProperty(HTMLElement.prototype, "clientWidth", {
    configurable: true,
    get: () => clientWidth,
  });
}

function renderTable() {
  render(
    <Table aria-label="Activity log">
      <TableBody>
        <TableRow>
          <TableCell>x</TableCell>
        </TableRow>
      </TableBody>
    </Table>,
  );
}

describe("Table", () => {
  it("makes a table that overflows a focusable region with the table's name", () => {
    stubWidths(900, 300);
    renderTable();
    const region = screen.getByRole("region", { name: "Activity log" });
    expect(region.getAttribute("tabindex")).toBe("0");
    expect(region.contains(screen.getByRole("table"))).toBe(true);
  });

  it("adds no region and no tab stop to a table that fits", () => {
    stubWidths(300, 300);
    renderTable();
    expect(screen.queryByRole("region")).toBeNull();
    expect(document.querySelector("[data-slot=table-container]")?.hasAttribute("tabindex")).toBe(
      false,
    );
  });
});
