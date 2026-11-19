// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The CKM panel (EL4, EL7) with the server calls replaced: every CKM failure shows as a
// translated message, never a raw code, and linking and importing call the server once.
import { QueryClient, QueryClientProvider, queryOptions } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CkmArchetype } from "@/server/ckm/client";
import type { CkmActionResult, CkmArchetypeView } from "@/server/ckm/queries";
import { type CkmActions, CkmPanel } from "./ckm-panel";

const archetypeAnswer = vi.fn<() => Promise<CkmActionResult<CkmArchetypeView>>>();

vi.mock("@/server/elements/query-options", () => ({
  archetypeElementsQueryOptions: (projectId: string, cid: string) =>
    queryOptions({
      queryKey: ["elements", projectId, "ckm", cid],
      queryFn: () => archetypeAnswer(),
      retry: false,
    }),
}));

afterEach(() => {
  cleanup();
  archetypeAnswer.mockReset();
});

const ROW: CkmArchetype = {
  cid: "1013.1.3574",
  archetypeId: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
  name: "Blood pressure",
  status: "PUBLISHED",
  revision: "2.0.17",
};

const VIEW: CkmArchetypeView = {
  ...ROW,
  originalLanguage: "en",
  elements: [
    {
      path: "/data[at0001]/events[at0006]/data[at0003]/items[at0004]",
      atCode: "at0004",
      name: "Systolic",
      description: "Peak systemic arterial blood pressure.",
      rmTypes: ["DV_QUANTITY"],
      occurrences: { min: 0, max: 1 },
      dataType: "quantity",
    },
  ],
};

function renderPanel(actions: Partial<CkmActions>, linkTarget = { id: "el-1", name: "Systolic" }) {
  const onDone = vi.fn();
  const all: CkmActions = {
    search: vi.fn(async () => ({ ok: true, value: [ROW] }) as const),
    link: vi.fn(async () => ({ ok: true, value: null }) as const),
    importAll: vi.fn(async () => ({ ok: true, value: { elementIds: ["a"] } }) as const),
    ...actions,
  };
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CkmPanel projectId="p-1" linkTarget={linkTarget} actions={all} onDone={onDone} />
    </QueryClientProvider>,
  );
  return { onDone, actions: all };
}

async function search(text = "blood pressure") {
  fireEvent.change(screen.getByLabelText("Search text"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
}

describe("CkmPanel", () => {
  it.each([
    ["ckm_unreachable", "CKM cannot be reached. Try again later."],
    ["ckm_timeout", "CKM took too long to answer. Try again later."],
    ["ckm_refused", "CKM refused the request. Try again later."],
    ["ckm_unusable", "CKM sent an answer this app cannot read."],
  ] as const)("shows the search failure %s as a message", async (error, text) => {
    renderPanel({ search: vi.fn(async () => ({ ok: false, error }) as const) });
    await search();
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(text);
    expect(alert.textContent).not.toContain(error);
  });

  it("needs a search text before it calls CKM", async () => {
    const { actions } = renderPanel({});
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(await screen.findByText("Enter a search text.")).toBeTruthy();
    expect(actions.search).not.toHaveBeenCalled();
  });

  it("lists the archetypes with ID, name, status and revision, then links an element", async () => {
    archetypeAnswer.mockResolvedValue({ ok: true, value: VIEW });
    const { actions, onDone } = renderPanel({});
    await search();
    expect(await screen.findByText(ROW.archetypeId)).toBeTruthy();
    expect(screen.getByText("PUBLISHED")).toBeTruthy();
    expect(screen.getByText("2.0.17")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show elements of Blood pressure" }));
    fireEvent.click(await screen.findByRole("button", { name: "Link to Systolic" }));
    await waitFor(() => expect(actions.link).toHaveBeenCalledWith(VIEW, VIEW.elements[0]));
    expect(onDone).toHaveBeenCalledWith(
      "Systolic is linked to openEHR-EHR-OBSERVATION.blood_pressure.v2.",
    );
  });

  it("shows a failure to read the archetype, and a refused link, as messages", async () => {
    archetypeAnswer.mockResolvedValueOnce({ ok: false, error: "ckm_timeout" });
    renderPanel({
      link: vi.fn(async () => ({ ok: false, error: "ckm_revision_changed" }) as const),
    });
    await search();
    fireEvent.click(await screen.findByRole("button", { name: "Show elements of Blood pressure" }));
    expect((await screen.findByRole("alert")).textContent).toContain("CKM took too long");
  });

  it("shows ckm_revision_changed and ckm_already_imported as messages", async () => {
    archetypeAnswer.mockResolvedValue({ ok: true, value: VIEW });
    const { onDone } = renderPanel({
      link: vi.fn(async () => ({ ok: false, error: "ckm_revision_changed" }) as const),
      importAll: vi.fn(async () => ({ ok: false, error: "ckm_already_imported" }) as const),
    });
    await search();
    fireEvent.click(await screen.findByRole("button", { name: "Show elements of Blood pressure" }));
    fireEvent.click(await screen.findByRole("button", { name: "Link to Systolic" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "The archetype has a new revision in CKM.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Import all elements of this archetype" }));
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain(
        "This archetype is already imported into the project.",
      ),
    );
    expect(onDone).not.toHaveBeenCalled();
  });
});
