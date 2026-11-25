// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The FHIR tab of "Add a model" (EL10): a quick pick opens a package without a search, and the
// profile list filters in the browser on title and canonical URL.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type AddModelActions, AddModelButton, matchesProfileFilter } from "./add-model";

afterEach(() => cleanup());

const BP = "http://hl7.org/fhir/StructureDefinition/bp";
const HEART = "http://hl7.org/fhir/StructureDefinition/heartrate";
const PROFILES = [
  { key: BP, title: "Observation BP", detail: BP },
  { key: HEART, title: "Heart rate", detail: HEART },
];

describe("matchesProfileFilter", () => {
  it("matches title and URL regardless of case, and everything when empty", () => {
    const bp = { key: BP, title: "Observation BP", detail: BP };
    expect(matchesProfileFilter(bp, "")).toBe(true);
    expect(matchesProfileFilter(bp, "  observation")).toBe(true);
    expect(matchesProfileFilter(bp, "STRUCTUREDEFINITION/BP")).toBe(true);
    expect(matchesProfileFilter(bp, "heart")).toBe(false);
  });
});

describe("FHIR tab", () => {
  it("opens a quick-pick package and filters its profiles", async () => {
    const actions: AddModelActions = {
      searchCkm: vi.fn(),
      addCkm: vi.fn(),
      searchFhir: vi.fn(),
      fhirVersions: vi.fn(async () => ({ ok: true as const, value: ["4.0.1"] })),
      fhirProfiles: vi.fn(async () => ({ ok: true as const, value: PROFILES })),
      addFhir: vi.fn(),
      addOther: vi.fn(),
    };
    render(<AddModelButton actions={actions} onAdded={() => undefined} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.mouseDown(await screen.findByRole("tab", { name: /FHIR/ }), { button: 0 });
    fireEvent.click(await screen.findByRole("button", { name: "hl7.fhir.r4.core" }));
    await waitFor(() =>
      expect(actions.fhirProfiles).toHaveBeenCalledWith("hl7.fhir.r4.core", "4.0.1"),
    );
    expect(await screen.findByText("Heart rate")).toBeTruthy();
    const filter = screen.getByLabelText(/filter/i);
    fireEvent.change(filter, { target: { value: "BP" } });
    expect(screen.queryByText("Heart rate")).toBeNull();
    expect(screen.getByText("Observation BP")).toBeTruthy();
    fireEvent.change(filter, { target: { value: "zzz" } });
    expect(screen.getByText(/no profile matches/i)).toBeTruthy();
  });
});
