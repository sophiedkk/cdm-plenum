// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The compact board (Q-USE-1): one row per element, a disclosure button that opens the details,
// the author and the actions for the facilitator only (EL2), and the comment refusals.
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommentOutcome } from "@/components/comments/comment-thread";
import type { CardElement } from "./element-details";
import { type ElementActions, ElementTable } from "./element-table";

type CommentsAnswer =
  | { ok: true; value: { id: string; body: string; createdAt: string; author: null }[] }
  | { ok: false; error: string };
const commentsAnswer = vi.fn<() => Promise<CommentsAnswer>>();

vi.mock("@/server/elements/query-options", () => ({
  elementCommentsQueryOptions: (projectId: string, elementId: string, withAuthors: boolean) =>
    queryOptions({
      queryKey: ["elements", projectId, "comments", elementId, withAuthors],
      queryFn: () => commentsAnswer(),
      retry: false,
    }),
}));

afterEach(() => {
  cleanup();
  commentsAnswer.mockReset();
});

const LINK = {
  archetypeId: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
  cid: "1013.1.3574",
  revision: "2.0.17",
  atCode: "at0004",
  ckmElementName: "Systolic",
  rmType: "DV_QUANTITY",
};

const SYSTOLIC: CardElement = {
  id: "e1",
  name: "Systolic",
  description: "The peak arterial pressure.",
  dataType: "quantity",
  cardinality: { min: 1, max: 1 },
  sources: [
    { kind: "brainstorm", label: "" },
    { kind: "ckm", label: LINK.archetypeId },
  ],
  values: [],
  ckmLink: LINK,
  mergedCkmLinks: [],
  commentCount: 3,
  createdAt: "2026-11-01T10:00:00Z",
  author: { memberId: "m1", name: "Invented Author", email: "author@example.test" },
};

const POSITION: CardElement = {
  id: "e2",
  name: "Position",
  description: "",
  dataType: "coded_text",
  cardinality: null,
  sources: [{ kind: "csv", label: "elements.csv" }],
  values: [{ text: "Sitting", value: null }],
  ckmLink: null,
  mergedCkmLinks: [{ ...LINK, atCode: "at0008", ckmElementName: "Position" }],
  commentCount: 0,
  createdAt: "2026-11-01T10:01:00Z",
  author: null,
};

const UNDECIDED: CardElement = {
  ...POSITION,
  id: "e3",
  name: "Cuff size",
  dataType: null,
  values: [],
  mergedCkmLinks: [],
};

function renderTable(isFacilitator: boolean, elements = [SYSTOLIC, POSITION, UNDECIDED]) {
  const actions: ElementActions = {
    addComment: vi.fn(async (): Promise<CommentOutcome> => ({ ok: true })),
    onCommentAdded: vi.fn(),
    onEdit: vi.fn(),
    onValues: vi.fn(),
    onLink: vi.fn(),
  };
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <ElementTable
        projectId="p1"
        elements={elements}
        isFacilitator={isFacilitator}
        actions={actions}
      />
    </QueryClientProvider>,
  );
  return actions;
}

/** The summary row of an element: the row of its disclosure button. */
function summaryRow(name: string): HTMLElement {
  const row = screen.getByRole("button", { name }).closest("tr");
  if (row === null) throw new Error(`no row for ${name}`);
  return row;
}

describe("ElementTable", () => {
  it("shows one row per element with the short fields", () => {
    commentsAnswer.mockResolvedValue({ ok: true, value: [] });
    renderTable(false);
    const table = screen.getByRole("table", { name: "Elements on the board" });
    expect(
      within(table)
        .getAllByRole("columnheader")
        .map((cell) => cell.textContent),
    ).toEqual([
      "No.",
      "Name",
      "Description",
      "Data type",
      "Cardinality",
      "Sources",
      "CKM",
      "Comments",
    ]);
    const cells = (name: string) =>
      within(summaryRow(name))
        .getAllByRole("cell")
        .map((cell) => cell.textContent);
    expect(cells("Systolic")).toEqual([
      "1",
      "The peak arterial pressure.",
      "Quantity",
      "1..1",
      "2",
      "Linked",
      "3",
    ]);
    expect(cells("Position")).toEqual([
      "2",
      "",
      "Coded text",
      "Not decided",
      "1",
      "Via merged duplicate",
      "0",
    ]);
    expect(cells("Cuff size")).toEqual([
      "3",
      "",
      "Not decided",
      "Not decided",
      "1",
      "Not linked",
      "0",
    ]);
    expect(commentsAnswer).not.toHaveBeenCalled();
  });

  it("shows the RM type of a CKM link outside the data type list", () => {
    renderTable(false, [
      { ...SYSTOLIC, dataType: null, ckmLink: { ...LINK, rmType: "DV_PARSABLE" } },
    ]);
    expect(within(summaryRow("Systolic")).getByText("DV_PARSABLE")).toBeTruthy();
  });

  it("opens and closes the details with the disclosure button", async () => {
    commentsAnswer.mockResolvedValue({
      ok: true,
      value: [{ id: "c1", body: "Use mm[Hg].", createdAt: "2026-11-02T10:00:00Z", author: null }],
    });
    renderTable(false);
    const toggle = screen.getByRole("button", { name: "Systolic" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    const details = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(details?.hidden).toBe(true);
    expect(screen.queryByRole("region", { name: "Details of Systolic" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(details?.hidden).toBe(false);
    const region = screen.getByRole("region", { name: "Details of Systolic" });
    expect(within(region).getByText("Quantity (DV_QUANTITY / Quantity)")).toBeTruthy();
    expect(within(region).getByText("The peak arterial pressure.")).toBeTruthy();
    expect(
      within(region).getByText(/openEHR-EHR-OBSERVATION.blood_pressure.v2, revision/),
    ).toBeTruthy();
    expect(await within(region).findByText("Use mm[Hg].")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Details of Position" })).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(details?.hidden).toBe(true);
    expect(screen.queryByRole("region", { name: "Details of Systolic" })).toBeNull();
  });

  it("shows a participant no author and no actions", () => {
    commentsAnswer.mockResolvedValue({ ok: true, value: [] });
    renderTable(false);
    fireEvent.click(screen.getByRole("button", { name: "Position" }));
    const region = screen.getByRole("region", { name: "Details of Position" });
    expect(within(region).queryByText("Added by")).toBeNull();
    expect(within(region).queryByRole("button", { name: /Edit/ })).toBeNull();
    expect(within(region).queryByRole("button", { name: /Link to CKM/ })).toBeNull();
    expect(within(region).getByText("Sitting")).toBeTruthy();
  });

  it("gives the facilitator the author and the actions of the element", () => {
    commentsAnswer.mockResolvedValue({ ok: true, value: [] });
    const actions = renderTable(true);
    fireEvent.click(screen.getByRole("button", { name: "Systolic" }));
    fireEvent.click(screen.getByRole("button", { name: "Position" }));
    const systolic = screen.getByRole("region", { name: "Details of Systolic" });
    expect(within(systolic).getByText("Invented Author")).toBeTruthy();
    expect(within(systolic).queryByRole("button", { name: "Edit values: Systolic" })).toBeNull();
    fireEvent.click(within(systolic).getByRole("button", { name: "Edit: Systolic" }));
    fireEvent.click(within(systolic).getByRole("button", { name: "Link to CKM: Systolic" }));
    expect(actions.onEdit).toHaveBeenCalledWith(SYSTOLIC);
    expect(actions.onLink).toHaveBeenCalledWith(SYSTOLIC);

    const position = screen.getByRole("region", { name: "Details of Position" });
    expect(within(position).getByText("A former member")).toBeTruthy();
    fireEvent.click(within(position).getByRole("button", { name: "Edit values: Position" }));
    expect(actions.onValues).toHaveBeenCalledWith(POSITION);
  });

  it("shows a refused comment list as a translated message", async () => {
    commentsAnswer.mockResolvedValue({ ok: false, error: "not_found" });
    renderTable(false);
    fireEvent.click(screen.getByRole("button", { name: "Systolic" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "This does not exist, or you have no access to it.",
    );
  });

  it("shows a failed comment request as an unexpected error", async () => {
    commentsAnswer.mockRejectedValue(new Error("network"));
    renderTable(false);
    fireEvent.click(screen.getByRole("button", { name: "Systolic" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Something went wrong on our side. Try again.",
    );
  });
});
