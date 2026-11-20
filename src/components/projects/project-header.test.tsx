// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project header (PR4, PR8, PR11): the name and one line of the scope, the steps with their
// state in words, the participant's task line with one main link, and the facilitator's status
// line with the phase move confirmed in the page.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import { PROJECT_STEPS, type ProjectStep, stepVisible } from "@/lib/phase-access";
import { PROJECT_PHASES } from "@/lib/project-phases";
import type { ProjectOverview } from "@/lib/project-tasks";
import {
  FacilitatorStatusLine,
  ParticipantTaskLine,
  PhaseSteps,
  ProjectHeader,
} from "./project-header";

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
    concept: "The pressure of the blood in the arteries",
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
    expect(steps).toEqual(["Scopedone", "Discovernow", "Decidelater", "Hand-offlater"]);
    expect(screen.getByText("Discover").closest("li")?.getAttribute("aria-current")).toBe("step");
  });

  it("shows one step per phase of the list, whatever its length", () => {
    render(<PhaseSteps phase="scope" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(PROJECT_PHASES.length);
  });

  it("says later to a screen reader only, so the row stays short", () => {
    render(<PhaseSteps phase="scope" />);
    for (const later of screen.getAllByText("later")) {
      expect(later.className).toContain("sr-only");
    }
    expect(screen.getByText("now").className).not.toContain("sr-only");
  });
});

describe("ProjectHeader", () => {
  const props = { projectId: "p1", name: "Blood pressure", move: vi.fn(), onMoved: vi.fn() };

  it("shows the name as the page heading and one line of the scope", () => {
    render(
      <ProjectHeader {...props} overview={overview({ concept: "  The pressure\nof blood " })} />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Blood pressure" })).toBeTruthy();
    const line = screen.getByTestId("project-scope-line");
    expect(line.textContent).toBe("The pressure of blood");
    expect(line.getAttribute("title")).toBe("The pressure of blood");
    expect(line.className).toContain("truncate");
  });

  it("says when the scope is not written yet", () => {
    render(<ProjectHeader {...props} overview={overview({ concept: "" })} />);
    expect(screen.getByTestId("project-scope-line").textContent).toBe(
      "The scope is not written yet.",
    );
  });

  it("shows a participant the task line and a facilitator the status line", () => {
    render(<ProjectHeader {...props} overview={overview()} />);
    expect(screen.getByRole("region", { name: "Your task now" })).toBeTruthy();
    cleanup();
    render(
      <ProjectHeader
        {...props}
        overview={overview({
          role: "facilitator",
          round: { ...facilitatorRound(), completed: 1, raters: 2 },
        })}
      />,
    );
    expect(screen.getByRole("region", { name: "Status of this phase" })).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Your task now" })).toBeNull();
  });
});

describe("ParticipantTaskLine", () => {
  it("shows the rating task with the count, the closing date and one main link", () => {
    render(<ParticipantTaskLine projectId="p1" overview={overview()} />);
    expect(screen.getByRole("region", { name: "Your task now" })).toBeTruthy();
    expect(screen.getByText("12 of 40 rated")).toBeTruthy();
    expect(screen.getByText(/Round closes/)).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((link) => [link.textContent, link.getAttribute("href")])).toEqual([
      ["Rate round 2", "/projects/p1/rounds/round-2/rate"],
    ]);
  });

  it("counts the participant's own elements while discovering", () => {
    render(<ParticipantTaskLine projectId="p1" overview={overview({ phase: "discover" })} />);
    expect(screen.getByText("You added 3 elements.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add elements" }).getAttribute("href")).toBe(
      "/projects/p1/brainstorm",
    );
  });

  it("says there is nothing to do, without a button, while no round is open", () => {
    render(<ParticipantTaskLine projectId="p1" overview={overview({ round: null })} />);
    expect(screen.getByText(/There is nothing for you to do now/)).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it.each(PROJECT_PHASES)(
    "links only to a step the %s phase shows a participant (PR9)",
    (phase) => {
      const round = phase === "decide" ? {} : { round: null };
      render(<ParticipantTaskLine projectId="p1" overview={overview({ phase, ...round })} />);
      const links = screen.getAllByRole("link").map((link) => link.getAttribute("href") ?? "");
      expect(links).toHaveLength(1);
      for (const href of links) {
        const step = href.split("/")[3] as ProjectStep;
        expect(PROJECT_STEPS).toContain(step);
        expect(stepVisible("participant", phase, step)).toBe(true);
      }
    },
  );

  it("speaks Dutch when the locale is Dutch", () => {
    overwriteGetLocale(() => "nl");
    render(<ParticipantTaskLine projectId="p1" overview={overview()} />);
    expect(screen.getByText("12 van 40 beoordeeld")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ronde 2 beoordelen" })).toBeTruthy();
  });
});

describe("FacilitatorStatusLine", () => {
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
      <FacilitatorStatusLine projectId="p1" overview={facilitator} move={move} onMoved={onMoved} />,
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
      <FacilitatorStatusLine projectId="p1" overview={facilitator} move={move} onMoved={vi.fn()} />,
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
      <FacilitatorStatusLine projectId="p1" overview={facilitator} move={move} onMoved={onMoved} />,
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
      <FacilitatorStatusLine
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
      <FacilitatorStatusLine
        projectId="p1"
        overview={overview({
          role: "facilitator",
          round: { ...facilitatorRound(), completed: 5, raters: 8 },
        })}
        move={vi.fn()}
        onMoved={vi.fn()}
      />,
    );
    expect(screen.getByText(/Round 2: 5 of 8 completed/)).toBeTruthy();
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
