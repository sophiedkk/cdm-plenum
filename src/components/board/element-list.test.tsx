// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The participant's board as a list (P8): the whole description, a signal only when it says
// something, and the details with comments and marks behind the name.
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CommentOutcome } from "@/components/comments/comment-thread";
import type { CardElement } from "./element-details";
import { ElementList, elementSignals } from "./element-list";
import type { ElementActions } from "./element-table";

vi.mock("@/server/elements/query-options", () => ({
  elementCommentsQueryOptions: (projectId: string, elementId: string, withAuthors: boolean) =>
    queryOptions({
      queryKey: ["elements", projectId, "comments", elementId, withAuthors],
      queryFn: async () => ({ ok: true as const, value: [] }),
      retry: false,
    }),
}));

afterEach(cleanup);

const LONG = `${"A long description of the element. ".repeat(12)}The end.`;

const PLAIN: CardElement = {
  id: "e1",
  name: "Systolic",
  description: LONG,
  dataType: null,
  cardinality: null,
  units: [],
  sources: [{ kind: "brainstorm", label: "" }],
  values: [],
  ckmLink: null,
  mergedCkmLinks: [],
  prompt: "recorded",
  reference: null,
  commentCount: 0,
  createdAt: "2026-11-01T10:00:00Z",
  author: null,
};

const BUSY: CardElement = {
  ...PLAIN,
  id: "e2",
  name: "Diastolic",
  description: "",
  sources: [
    { kind: "brainstorm", label: "" },
    { kind: "csv", label: "elements.csv" },
  ],
  ckmLink: {
    archetypeId: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
    cid: "1013.1.3574",
    revision: "2.0.17",
    atCode: "at0005",
    ckmElementName: "Diastolic",
    rmType: "DV_QUANTITY",
  },
  commentCount: 2,
};

function renderList(elements: CardElement[], detailFields = false) {
  const actions: ElementActions = {
    addComment: vi.fn(async (): Promise<CommentOutcome> => ({ ok: true })),
    onCommentAdded: vi.fn(),
    onEdit: vi.fn(),
    onValues: vi.fn(),
    onLink: vi.fn(),
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ElementList
        projectId="p1"
        elements={elements}
        detailFields={detailFields}
        actions={actions}
      />
    </QueryClientProvider>,
  );
}

describe("elementSignals", () => {
  it("is empty for an element with one source, no link and no comments", () => {
    expect(elementSignals(PLAIN, false)).toEqual([]);
  });

  it("names more than one source, a CKM link and the comments", () => {
    expect(elementSignals(BUSY, false).map((signal) => signal.key)).toEqual([
      "sources",
      "ckm",
      "comments",
    ]);
    expect(elementSignals(BUSY, false)[0]?.label).toBe("2 sources");
  });

  it("says one comment in the singular", () => {
    expect(elementSignals({ ...PLAIN, commentCount: 1 }, false)[0]?.label).toBe("1 comment");
  });

  it("leaves data type and cardinality out before the detail phase and when undecided", () => {
    const decided = { ...PLAIN, dataType: "quantity", cardinality: { min: 1, max: 1 } } as const;
    expect(elementSignals(decided, false)).toEqual([]);
    expect(elementSignals(PLAIN, true)).toEqual([]);
    expect(elementSignals(decided, true).map((signal) => signal.key)).toEqual([
      "type",
      "cardinality",
    ]);
  });
});

describe("ElementList", () => {
  it("is a list with the whole description and no table", () => {
    renderList([PLAIN, BUSY]);
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getAllByRole("listitem").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(LONG).className).not.toContain("truncate");
  });

  it("shows no signal for a plain element and the signals of a busy one", () => {
    renderList([PLAIN, BUSY]);
    expect(screen.queryByText("1 sources")).toBeNull();
    expect(screen.queryByText("Not linked")).toBeNull();
    expect(screen.getByText("2 sources")).toBeTruthy();
    expect(screen.getByText("Linked")).toBeTruthy();
    expect(screen.getByText("2 comments")).toBeTruthy();
  });

  it("opens the details once, without repeating the description", async () => {
    renderList([PLAIN]);
    fireEvent.click(screen.getByRole("button", { name: /Systolic/ }));
    expect(await screen.findByRole("region", { name: "Details of Systolic" })).toBeTruthy();
    expect(screen.getAllByText(LONG)).toHaveLength(1);
  });
});
