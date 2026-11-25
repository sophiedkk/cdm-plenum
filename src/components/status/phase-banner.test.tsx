// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The banner of a finished phase (F3): a read view for the facilitator until "Edit anyway".
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { ProjectStep } from "@/lib/phase-access";
import type { ProjectPhase } from "@/lib/project-phases";
import type { ProjectRole } from "@/lib/project-roles";
import { usePhaseEdit } from "./phase-banner";

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

function Page({
  member,
  phase,
  step,
}: Readonly<{ member: ProjectRole; phase: ProjectPhase; step: ProjectStep }>) {
  const { editable, banner } = usePhaseEdit(member, phase, step);
  return (
    <main>
      <h2>Title</h2>
      {banner}
      {editable && <button type="button">Edit form</button>}
    </main>
  );
}

describe("usePhaseEdit", () => {
  it("shows the banner and no controls on a finished step of the facilitator", () => {
    render(<Page member="facilitator" phase="decide" step="scope" />);
    expect(screen.getByText("This phase is finished")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit form" })).toBeNull();
  });

  it("opens the controls and drops the banner after Edit anyway, and moves focus", async () => {
    render(<Page member="facilitator" phase="decide" step="scope" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit anyway" }));
    expect(screen.queryByText("This phase is finished")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit form" })).toBeTruthy();
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Title" }));
  });

  it("shows the controls without a banner in the step's own phase and ahead of it", () => {
    render(<Page member="facilitator" phase="scope" step="scope" />);
    expect(screen.queryByText("This phase is finished")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit form" })).toBeTruthy();
    cleanup();
    render(<Page member="facilitator" phase="scope" step="rounds" />);
    expect(screen.queryByText("This phase is finished")).toBeNull();
  });

  it("leaves a participant's page to the phase table", () => {
    render(<Page member="participant" phase="decide" step="scope" />);
    expect(screen.queryByText("This phase is finished")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit form" })).toBeTruthy();
  });

  it("speaks Dutch when the locale is Dutch", () => {
    overwriteGetLocale(() => "nl");
    render(<Page member="facilitator" phase="decide" step="scope" />);
    expect(screen.getByText("Deze fase is afgerond")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Toch bewerken" })).toBeTruthy();
  });
});
