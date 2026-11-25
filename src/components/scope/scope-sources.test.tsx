// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The scope sources (SC1): safe links, move buttons instead of drag and drop, and the add form.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AddSourceForm, ScopeSourceList } from "./scope-sources";

afterEach(cleanup);

const SOURCES = [
  { id: "s1", label: "ESC guideline", url: "https://example.test/esc" },
  { id: "s2", label: "Ward form", url: null },
];

describe("ScopeSourceList", () => {
  it("opens a link in a new tab without access to this page", () => {
    render(<ScopeSourceList sources={SOURCES} editable={false} />);
    const link = screen.getByRole("link", { name: /ESC guideline/ });
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("lets the facilitator move a source with buttons; the edges are disabled", () => {
    const move = vi.fn(async () => undefined);
    render(<ScopeSourceList sources={SOURCES} editable move={move} remove={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Move ESC guideline up" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(screen.getByRole("button", { name: "Move Ward form down" })).toHaveProperty(
      "disabled",
      true,
    );
    fireEvent.click(screen.getByRole("button", { name: "Move Ward form up" }));
    expect(move).toHaveBeenCalledWith("s2", -1);
  });

  it("removes a source at once, without a confirmation (the page offers Undo)", () => {
    const remove = vi.fn(async () => undefined);
    render(<ScopeSourceList sources={SOURCES} editable move={vi.fn()} remove={remove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove Ward form" }));
    expect(remove).toHaveBeenCalledWith(SOURCES[1]);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("AddSourceForm", () => {
  it("needs a title and an http or https address when one is given", async () => {
    const add = vi.fn();
    render(<AddSourceForm add={add} onAdded={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Web address"), {
      target: { value: "javascript:alert(1)" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add source" }));
    expect(await screen.findByText("Enter a title for the source.")).toBeTruthy();
    expect(screen.getByText(/Enter a web address that starts with/)).toBeTruthy();
    expect(add).not.toHaveBeenCalled();
  });

  it("sends a source without an address as null", async () => {
    const add = vi.fn(async () => ({ ok: true }) as const);
    const onAdded = vi.fn();
    render(<AddSourceForm add={add} onAdded={onAdded} />);
    fireEvent.change(screen.getByLabelText("Title of the source"), {
      target: { value: "Ward form" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add source" }));
    await waitFor(() => expect(onAdded).toHaveBeenCalledWith("Ward form"));
    expect(add).toHaveBeenCalledWith({ label: "Ward form", url: null });
  });
});
