// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The coverage table (EL20): the "Matched by" column shows only when two or more models can be
// matched; with one model it would say "only one model" on every row.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Coverage, StoredSourceElement } from "@/server/sources/queries";
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
  };
}

const MODEL_A = { id: "a", kind: "ckm", status: "added", title: "Pulse" } as const;
const MODEL_B = { id: "b", kind: "fhir", status: "added", title: "Heart rate" } as const;

function renderTable(coverage: Coverage) {
  render(
    <CoverageTable
      coverage={coverage}
      putOnList={vi.fn(async () => ({ ok: true as const, value: { createdElementIds: [] } }))}
      onListed={vi.fn()}
    />,
  );
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
});
