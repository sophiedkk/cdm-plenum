// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project overview (PR4, PR8): the steps carry their state in words, the participant card
// has one main link, and the facilitator confirms a phase move in the page.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { ProjectOverview } from "@/lib/project-tasks";
import { FacilitatorPhasePanel, ParticipantTaskCard, PhaseSteps } from "./project-overview";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

// The router's Link needs a router; the test checks where a link points, not navigation.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    className,
  }: {
    to: string;
    params: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => (
    <a
      href={Object.entries(params).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
      className={className}
    >
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  overwriteGetLocale(() => baseLocale);
});

function overview(changes: Partial<ProjectOverview> = {}): ProjectOverview {
  return {
    phase: "decide",
    role: "participant",
    elements: 40,
    ownElements: 3,
    round: {
      id: "round-2",
      number: 2,
      status: "open",
      closesAt: "2026-12-01T16:00:00.000Z",
      elements: 40,
      rated: 12,
      completed: null,
      raters: null,
    },
    lastClosedRoundId: "round-1",
    ...changes,
  };
}

describe("PhaseSteps", () => {
  it("names the state of every phase in text and marks the current step", () => {
    render(<PhaseSteps phase="discover" />);
    const steps = within(screen.getByRole("list", { name: "Phases of the project" }))
      .getAllByRole("listitem")
      .map((item) => item.textContent);
    expect(steps).toEqual(["Scope(done)", "Discover(now)", "Decide(next)", "Hand-off(later)"]);
    expect(screen.getByText("Discover").closest("li")?.getAttribute("aria-current")).toBe("step");
  });
});

describe("ParticipantTaskCard", () => {
  it("shows the rating task with the count, the closing date and one main link", () => {
    render(<ParticipantTaskCard projectId="p1" overview={overview()} />);
    expect(screen.getByRole("heading", { name: "Your task now" })).toBeTruthy();
    expect(screen.getByText("12 of 40 rated")).toBeTruthy();
    expect(screen.getByText("Round closes")).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Rate round 2", "/projects/p1/rounds/round-2/rate"],
    ]);
  });

  it("counts the participant's own elements while discovering", () => {
    render(<ParticipantTaskCard projectId="p1" overview={overview({ phase: "discover" })} />);
    expect(screen.getByText("You added 3 elements.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add elements" }).getAttribute("href")).toBe(
      "/projects/p1/board",
    );
  });

  it("says there is nothing to do, without a button, while no round is open", () => {
    render(<ParticipantTaskCard projectId="p1" overview={overview({ round: null })} />);
    expect(screen.getByText(/There is nothing for you to do now/)).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("speaks Dutch when the locale is Dutch", () => {
    overwriteGetLocale(() => "nl");
    render(<ParticipantTaskCard projectId="p1" overview={overview()} />);
    expect(screen.getByText("12 van 40 beoordeeld")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ronde 2 beoordelen" })).toBeTruthy();
  });
});

describe("FacilitatorPhasePanel", () => {
  const facilitator = overview({
    phase: "discover",
    role: "facilitator",
    round: null,
    elements: 8,
  });

  it("moves the phase only after the confirmation in the page", async () => {
    const move = vi.fn().mockResolvedValue({ ok: true, value: { phase: "decide" } });
    const onMoved = vi.fn();
    render(
      <FacilitatorPhasePanel projectId="p1" overview={facilitator} move={move} onMoved={onMoved} />,
    );
    expect(screen.getByText("8 elements on the board.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Go on to Decide" }));
    expect(move).not.toHaveBeenCalled();
    expect(screen.getByText(/Move the project on to Decide\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yes, move to Decide" }));
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    expect(move).toHaveBeenCalledWith("next");
    expect(toast.success).toHaveBeenCalledWith("The project is now in the phase Decide.");
  });

  it("cancels without a move and returns focus to the button", async () => {
    const move = vi.fn();
    render(
      <FacilitatorPhasePanel projectId="p1" overview={facilitator} move={move} onMoved={vi.fn()} />,
    );
    const back = screen.getByRole("button", { name: "Back to Scope" });
    fireEvent.click(back);
    expect(screen.getByText(/Move the project back to Scope\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Move the project back to Scope\?/)).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(back));
    expect(move).not.toHaveBeenCalled();
  });

  it("shows a refusal as its message and keeps the confirmation open", async () => {
    const move = vi.fn().mockResolvedValue({ ok: false, error: "phase_changed" });
    const onMoved = vi.fn();
    render(
      <FacilitatorPhasePanel projectId="p1" overview={facilitator} move={move} onMoved={onMoved} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Go on to Decide" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, move to Decide" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "The phase changed in the meantime. Reload the page to see the current phase.",
      ),
    );
    expect(onMoved).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Yes, move to Decide" })).toBeTruthy();
  });

  it("offers no move on from the last phase", () => {
    render(
      <FacilitatorPhasePanel
        projectId="p1"
        overview={{ ...facilitator, phase: "handoff" }}
        move={vi.fn()}
        onMoved={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /Go on to/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Back to Decide" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Export the list" })).toBeTruthy();
  });

  it("shows the open round's response while deciding", () => {
    render(
      <FacilitatorPhasePanel
        projectId="p1"
        overview={overview({
          role: "facilitator",
          round: { ...facilitatorRound(), completed: 5, raters: 8 },
        })}
        move={vi.fn()}
        onMoved={vi.fn()}
      />,
    );
    expect(screen.getByText("Round 2: 5 of 8 completed")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to round 2" }).getAttribute("href")).toBe(
      "/projects/p1/rounds/round-2",
    );
  });
});

function facilitatorRound() {
  const round = overview().round;
  if (round === null) throw new Error("no round");
  return { ...round, rated: null };
}
