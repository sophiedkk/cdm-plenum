// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The discover recap (PR13) shows each fact once: without existing models, only the side section
// says so, with no "0 from 0 existing models" card.
import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiscoverRecap } from "@/server/projects/recap";
import { PhaseRecapView } from "./phase-recap";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
}));

afterEach(() => cleanup());

function recap(changes: Partial<DiscoverRecap> = {}): DiscoverRecap {
  return {
    phase: "discover",
    closedAt: null,
    elements: 8,
    fromModels: 0,
    models: [],
    added: 8,
    contributors: 5,
    fromFiles: 0,
    merged: 0,
    groups: [],
    firstRound: null,
    ...changes,
  };
}

describe("the discover recap", () => {
  it("leaves out the models card when no model was imported", () => {
    render(<PhaseRecapView projectId="p1" recap={recap()} />);
    expect(screen.queryByText(/existing models$/)).toBeNull();
    expect(screen.getAllByText("None.")).toHaveLength(1);
  });

  it("counts the elements from models when there are some", () => {
    render(
      <PhaseRecapView
        projectId="p1"
        recap={recap({ fromModels: 12, models: [{ kind: "ckm", title: "Pulse/Heart beat" }] })}
      />,
    );
    expect(screen.getByText("from 1 existing models")).toBeTruthy();
    expect(screen.getByText("Pulse/Heart beat")).toBeTruthy();
  });
});
