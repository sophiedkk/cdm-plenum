// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The coverage table (EL20): the "Matched by" column shows only when two or more models can be
// matched; with one model it would say "only one model" on every row. "Not the same" splits a
// suggested match only. The base model (EL25) is a toggle in its column header, and a row it
// lacks says "Not in the base".
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Outcome } from "@/lib/forms/outcome";
import type { Coverage, CoverageRowView, StoredSourceElement } from "@/server/sources/queries";
import { CoverageTable } from "./coverage-table";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

afterEach(() => cleanup());

function element(id: string, sourceModelId: string, name: string): StoredSourceElement {
  return {
    id,
    sourceModelId,
    path: `/data[at0001]/items[${id}]`,
    atCode: null,
    name,
    definition: "",
    type: "DV_QUANTITY",
    min: 0,
    max: 1,
    codeSystem: null,
    code: null,
    codeDisplay: null,
    bindingStrength: null,
    bindingValueSet: null,
    nlCmId: null,
    unmatched: false,
  };
}

const MODEL_A = { id: "a", kind: "ckm", status: "added", title: "Pulse", base: false } as const;
const MODEL_B = {
  id: "b",
  kind: "fhir",
  status: "added",
  title: "Heart rate",
  base: false,
} as const;

function renderTable(
  coverage: Coverage,
  unmatch: (rowId: string) => Promise<Outcome<null>> = vi.fn(async () => ({
    ok: true as const,
    value: null,
  })),
  onListed: () => void = vi.fn(),
  setBase: (modelId: string, base: boolean) => Promise<Outcome<null>> = vi.fn(async () => ({
    ok: true as const,
    value: null,
  })),
) {
  render(
    <CoverageTable
      coverage={coverage}
      putOnList={vi.fn(async () => ({ ok: true as const, value: { createdElementIds: [] } }))}
      unmatch={unmatch}
      setBase={setBase}
      onListed={onListed}
    />,
  );
}

function twoModelRow(basis: CoverageRowView["basis"], extra: Partial<CoverageRowView> = {}) {
  return {
    id: "e1",
    basis,
    applied: basis === "code",
    key: null,
    onList: false,
    cells: { a: [element("e1", "a", "Pulse rate")], b: [element("e2", "b", "Heart rate")] },
    ...extra,
  };
}

describe("CoverageTable", () => {
  it("leaves out Matched by with one model", () => {
    renderTable({
      models: [MODEL_A],
      rows: [
        {
          id: "e1",
          basis: "none",
          applied: false,
          key: null,
          onList: false,
          cells: { a: [element("e1", "a", "Rate")] },
        },
      ],
    });
    expect(screen.queryByRole("columnheader", { name: "Matched by" })).toBeNull();
    expect(screen.queryByText("only one model")).toBeNull();
  });

  it("shows Matched by with two models", () => {
    renderTable({
      models: [MODEL_A, MODEL_B],
      rows: [
        {
          id: "e1",
          basis: "name",
          applied: false,
          key: null,
          onList: false,
          cells: { a: [element("e1", "a", "Rate")], b: [element("e2", "b", "Rate")] },
        },
      ],
    });
    expect(screen.getByRole("columnheader", { name: "Matched by" })).toBeTruthy();
    expect(screen.getByText("name")).toBeTruthy();
  });

  it("shows each model's own name in a matched row when it differs", () => {
    renderTable({ models: [MODEL_A, MODEL_B], rows: [twoModelRow("name")] });
    expect(screen.getByRole("rowheader", { name: /Pulse rate/ })).toBeTruthy();
    expect(screen.getByText("Heart rate", { selector: "td span" })).toBeTruthy();
  });

  it("offers Not the same only on a suggested row that is not on the list", () => {
    renderTable({
      models: [MODEL_A, MODEL_B],
      rows: [
        twoModelRow("mapping"),
        twoModelRow("code", { id: "e3" }),
        twoModelRow("name", { id: "e5", onList: true }),
      ],
    });
    expect(screen.getAllByRole("button", { name: /^Not the same/ })).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Not the same: Pulse rate" })).toBeTruthy();
  });

  it("splits the row and reloads the table", async () => {
    const unmatch = vi.fn(async () => ({ ok: true as const, value: null }));
    const onListed = vi.fn();
    renderTable({ models: [MODEL_A, MODEL_B], rows: [twoModelRow("name")] }, unmatch, onListed);
    fireEvent.click(screen.getByRole("button", { name: "Not the same: Pulse rate" }));
    await waitFor(() => expect(onListed).toHaveBeenCalledOnce());
    expect(unmatch).toHaveBeenCalledWith("e1");
    expect(toast.success).toHaveBeenCalledWith("Split into separate rows.");
  });

  it("shows a refusal and leaves the table", async () => {
    const unmatch = vi.fn(async () => ({
      ok: false as const,
      error: "source_row_on_list" as const,
    }));
    const onListed = vi.fn();
    renderTable({ models: [MODEL_A, MODEL_B], rows: [twoModelRow("name")] }, unmatch, onListed);
    fireEvent.click(screen.getByRole("button", { name: "Not the same: Pulse rate" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This row is already on the list, so you can no longer split it.",
      ),
    );
    expect(onListed).not.toHaveBeenCalled();
  });

  it("offers no base model with one model", () => {
    renderTable({
      models: [MODEL_A],
      rows: [
        {
          id: "e1",
          basis: "none",
          applied: false,
          key: null,
          onList: false,
          cells: { a: [element("e1", "a", "Rate")] },
        },
      ],
    });
    expect(screen.queryByRole("button", { name: /as the base model/ })).toBeNull();
  });

  it("marks no row Not in the base while no model is the base", () => {
    renderTable({
      models: [MODEL_A, MODEL_B],
      rows: [twoModelRow("none", { cells: { a: [element("e1", "a", "Rhythm")] } })],
    });
    expect(screen.queryByText("Not in the base")).toBeNull();
    for (const title of ["Pulse", "Heart rate"]) {
      const toggle = screen.getByRole("button", { name: `${title} as the base model` });
      expect(toggle.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("marks the rows the base model lacks, in the order the server sends", () => {
    renderTable({
      // The server puts the base model first (EL25).
      models: [{ ...MODEL_B, base: true }, MODEL_A],
      rows: [
        twoModelRow("code"),
        twoModelRow("none", { id: "e3", cells: { a: [element("e3", "a", "Rhythm")] } }),
      ],
    });
    const headers = screen.getAllByRole("columnheader").map((cell) => cell.textContent);
    expect(headers.slice(2, 4)).toEqual(["Heart rateBase model", "PulseBase model"]);
    expect(
      screen
        .getByRole("button", { name: "Heart rate as the base model" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
    expect(screen.getAllByText("Not in the base")).toHaveLength(1);
    expect(screen.getByRole("rowheader", { name: /Rhythm/ }).textContent).toContain(
      "Not in the base",
    );
    expect(screen.getByRole("rowheader", { name: /Pulse rate/ }).textContent).not.toContain(
      "Not in the base",
    );
  });

  it("marks a model as the base, or unmarks it, and reloads the table", async () => {
    const setBase = vi.fn(async () => ({ ok: true as const, value: null }));
    const onListed = vi.fn();
    renderTable(
      { models: [{ ...MODEL_A, base: true }, MODEL_B], rows: [twoModelRow("code")] },
      undefined,
      onListed,
      setBase,
    );
    fireEvent.click(screen.getByRole("button", { name: "Heart rate as the base model" }));
    await waitFor(() => expect(onListed).toHaveBeenCalledOnce());
    expect(setBase).toHaveBeenCalledWith("b", true);
    expect(toast.success).toHaveBeenCalledWith(
      "Heart rate is now the base model. Rows it lacks show what the other models add.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Pulse as the base model" }));
    await waitFor(() => expect(onListed).toHaveBeenCalledTimes(2));
    expect(setBase).toHaveBeenLastCalledWith("a", false);
    expect(toast.success).toHaveBeenLastCalledWith("Pulse is no longer the base model.");
  });

  it("shows a refusal of the base model and leaves the table", async () => {
    const setBase = vi.fn(async () => ({
      ok: false as const,
      error: "source_after_discover" as const,
    }));
    const onListed = vi.fn();
    renderTable(
      { models: [MODEL_A, MODEL_B], rows: [twoModelRow("code")] },
      undefined,
      onListed,
      setBase,
    );
    fireEvent.click(screen.getByRole("button", { name: "Pulse as the base model" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "You can add or import source models until the Discover phase ends.",
      ),
    );
    expect(onListed).not.toHaveBeenCalled();
  });
});
