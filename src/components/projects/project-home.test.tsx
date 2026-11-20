// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The participant's project home and the projects list (PR2, PR5, PR7, PR8, PR11, ADR 0019):
// the steps as status only, the "Your turn" card or one line when nothing waits, "Decided so
// far", the links to the scope and the elements, "About this project", and a projects row.
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { DecidedSoFar, Waiting } from "@/lib/project-home";
import type { ProjectOverview } from "@/lib/project-tasks";
import type { VisibleGroup } from "@/server/projects/queries";
import { AboutProject } from "./about-project";
import { DecidedSoFarSection } from "./decided-so-far";
import { PhaseSteps } from "./phase-steps";
import { ProjectHeader } from "./project-header";
import { ProjectPages } from "./project-pages";
import { ProjectRow, waitingText } from "./project-row";
import { TaskCard } from "./task-card";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function resolve(to: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), to);
}

// The router's Link needs a router; the tests check where a link points, not navigation.
vi.mock("@tanstack/react-router", () => ({
  useMatchRoute: () => () => false,
  Link: ({
    to,
    params = {},
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={resolve(to, params)} className={className}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  overwriteGetLocale(() => baseLocale);
});

const CLOSES = "2026-11-26T22:05:00.000Z";

const ROUND: NonNullable<ProjectOverview["round"]> = {
  id: "round-2",
  number: 2,
  status: "open",
  closesAt: CLOSES,
  elements: 2,
  rated: 0,
  completed: null,
  raters: null,
};

function overview(changes: Partial<ProjectOverview> = {}): ProjectOverview {
  return {
    phase: "decide",
    role: "participant",
    elements: 8,
    ownElements: 3,
    firstLook: { total: 0, answered: 0 },
    round: ROUND,
    lastClosedRoundId: "round-1",
    ...changes,
  };
}

describe("the phase steps", () => {
  it("say the state of each phase in words and mark the current one", () => {
    render(<PhaseSteps phase="decide" />);
    const steps = screen.getByRole("list", { name: "Phases of the project" });
    expect(
      within(steps)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Scope, done", "Discover, done", "Decide, now", "Hand-off, later"]);
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toBe("Decide, now");
  });

  it("are no links for a participant: they show the status, the home leads on", () => {
    render(
      <ProjectHeader projectId="p1" name="Blood pressure" overview={overview()} back="projects" />,
    );
    const steps = screen.getByRole("list", { name: "Phases of the project" });
    expect(within(steps).queryAllByRole("link")).toHaveLength(0);
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toBe("Decide, now");
  });

  it("sit below the way back to the project on a page of the project", () => {
    render(
      <ProjectHeader projectId="p1" name="Blood pressure" overview={overview()} back="home" />,
    );
    expect(screen.getByRole("link", { name: "Back to the project" }).getAttribute("href")).toBe(
      "/projects/p1",
    );
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("are no links for the facilitator, whose tabs navigate", () => {
    render(
      <ProjectHeader
        projectId="p1"
        name="Blood pressure"
        overview={overview({ role: "facilitator" })}
        back="projects"
      />,
    );
    const steps = screen.getByRole("list", { name: "Phases of the project" });
    expect(within(steps).queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: "Blood pressure" })).toBeTruthy();
  });
});

describe("ProjectPages (PR9, ADR 0019)", () => {
  it("links the scope and the elements by the heading of the page they open", () => {
    render(<ProjectPages projectId="p1" pages={["scope", "board"]} />);
    const nav = screen.getByRole("navigation", { name: "In this project" });
    expect(
      within(nav)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([
      ["Scope", "/projects/p1/scope"],
      ["Element board", "/projects/p1/board"],
    ]);
  });

  it("shows nothing without a page to link", () => {
    const { container } = render(<ProjectPages projectId="p1" pages={[]} />);
    expect(container.textContent).toBe("");
  });
});

describe("TaskCard (PR8)", () => {
  it("asks to rate with the facts and one main link", () => {
    render(<TaskCard projectId="p1" overview={overview()} />);
    const card = screen.getByRole("region", { name: "Your turn: rate round 2" });
    const facts = [...card.querySelectorAll("dt")].map((term) => term.textContent);
    expect(facts).toEqual(["Elements", "Closes", "Rated by you"]);
    expect(card.querySelector("time")?.getAttribute("dateTime")).toBe(CLOSES);
    // The closing date names its time zone.
    expect(card.querySelector("time")?.textContent).toMatch(/UTC/);
    expect(
      within(card)
        .getAllByRole("link")
        .map((link) => [link.textContent, link.getAttribute("href")]),
    ).toEqual([["Start rating", "/projects/p1/rounds/round-2/rate"]]);
  });

  it("goes on rating once something is rated", () => {
    render(
      <TaskCard
        projectId="p1"
        overview={overview({ round: { ...ROUND, elements: 3, rated: 1 } })}
      />,
    );
    expect(screen.getByRole("link", { name: "Go on rating" })).toBeTruthy();
  });

  it("asks a discovering participant to add elements, with their own count", () => {
    render(<TaskCard projectId="p1" overview={overview({ phase: "discover", round: null })} />);
    const card = screen.getByRole("region", { name: "Your turn: add elements" });
    expect(card.querySelector("dd")?.textContent).toBe("3");
    expect(within(card).getByRole("link").getAttribute("href")).toBe("/projects/p1/brainstorm");
  });

  it("asks whether elements belong, not how important they are", () => {
    render(<TaskCard projectId="p1" overview={overview()} />);
    expect(document.body.textContent).not.toMatch(/important/);
  });

  it("shows one line and no card or button when nothing waits", () => {
    render(<TaskCard projectId="p1" overview={overview({ round: null })} />);
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByTestId("task-line").textContent).toMatch(/nothing for you to do now/);
  });

  it("keeps a quiet way back to the scores of a round rated in full", () => {
    render(<TaskCard projectId="p1" overview={overview({ round: { ...ROUND, rated: 2 } })} />);
    expect(screen.queryByRole("region")).toBeNull();
    const line = screen.getByTestId("task-line");
    expect(line.textContent).toContain("You rated every element of round 2.");
    expect(within(line).getByRole("link").className).not.toMatch(/bg-primary/);
  });

  it("speaks Dutch when the locale is Dutch", () => {
    overwriteGetLocale(() => "nl");
    render(<TaskCard projectId="p1" overview={overview()} />);
    expect(screen.getByRole("region", { name: "Jouw beurt: beoordeel ronde 2" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Begin met beoordelen" })).toBeTruthy();
  });
});

const DECIDED: DecidedSoFar = {
  elements: [
    { id: "a", name: "Systolic", status: "included" },
    { id: "b", name: "Diastolic", status: "included" },
    { id: "c", name: "Pulse pressure", status: "excluded" },
    { id: "d", name: "Cuff size", status: "no_consensus" },
    { id: "e", name: "Comment", status: "not_rated" },
  ],
  lastClosedRound: { id: "round-1", number: 1 },
};

describe("DecidedSoFarSection (PR8)", () => {
  it("splits one bar by status, named in full for a screen reader", () => {
    render(<DecidedSoFarSection projectId="p1" decided={DECIDED} />);
    const bar = screen.getByRole("img");
    expect(bar.getAttribute("aria-label")).toBe(
      "2 in the model, 1 not in the model, 1 still open, 1 not rated yet",
    );
    expect(
      [...bar.querySelectorAll("[data-status]")].map((part) => [
        part.getAttribute("data-status"),
        (part as HTMLElement).style.flexGrow,
      ]),
    ).toEqual([
      ["included", "2"],
      ["excluded", "1"],
      ["no_consensus", "1"],
      ["not_rated", "1"],
    ]);
  });

  it("lists each status once with its count in the heading and its elements", () => {
    render(<DecidedSoFarSection projectId="p1" decided={DECIDED} />);
    const included = screen.getByRole("region", { name: "In the model 2" });
    expect(
      within(included)
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(["Systolic", "Diastolic"]);
    expect(screen.getByRole("region", { name: "Not rated yet 1" }).textContent).toContain(
      "Comment",
    );
    // No count line repeats the rows.
    expect(document.body.textContent).not.toMatch(/of 5 elements/);
  });

  it("links to the newest closed round's results", () => {
    render(<DecidedSoFarSection projectId="p1" decided={DECIDED} />);
    expect(screen.getByRole("link", { name: "Round 1 results" }).getAttribute("href")).toBe(
      "/projects/p1/rounds/round-1",
    );
  });

  it("says so when the board is empty, without a bar", () => {
    render(
      <DecidedSoFarSection projectId="p1" decided={{ elements: [], lastClosedRound: null }} />,
    );
    expect(screen.queryByRole("img")).toBeNull();
    expect(screen.getByText("No elements on the board yet.")).toBeTruthy();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

const NURSING: VisibleGroup = {
  id: "g1",
  name: "Nursing",
  expertType: "clinical",
  participants: 2,
  names: null,
};

const GROUPS: VisibleGroup[] = [
  NURSING,
  { id: "g2", name: "Terminology", expertType: "terminology", participants: 0, names: null },
];

describe("AboutProject (PR5, PR7)", () => {
  it("opens below its button with the groups and leaving the project", () => {
    render(
      <AboutProject
        projectName="Blood pressure"
        groups={GROUPS}
        leave={vi.fn()}
        onLeft={vi.fn()}
      />,
    );
    const toggle = screen.getByRole("button", { name: "About this project" });
    const panel = document.getElementById(toggle.getAttribute("aria-controls") ?? "");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(panel?.hidden).toBe(true);
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(panel?.hidden).toBe(false);
    expect(within(panel as HTMLElement).getByText("2 participants")).toBeTruthy();
    // A group without people is left out.
    expect(within(panel as HTMLElement).queryByText("Terminology")).toBeNull();
    expect(
      within(panel as HTMLElement).getByRole("button", { name: "Leave project" }),
    ).toBeTruthy();
  });

  it("shows names only when the server sent them (PR7)", () => {
    render(
      <AboutProject
        projectName="Blood pressure"
        groups={[{ ...NURSING, names: ["Nurse A", ""] }]}
        leave={vi.fn()}
        onLeft={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "About this project" }));
    expect(screen.getByText("Nurse A")).toBeTruthy();
    expect(screen.getByText("Name not set")).toBeTruthy();
    expect(screen.queryByText("2 participants")).toBeNull();
  });
});

describe("ProjectRow (PR2, PR8)", () => {
  const link = (children: ReactNode, className: string) => (
    <a href="/projects/p1" className={className}>
      {children}
    </a>
  );

  it("shows the name, the phase in words and what waits with its deadline", () => {
    render(
      <ProjectRow
        project={{
          id: "p1",
          name: "Blood pressure",
          phase: "decide",
          role: "participant",
          waiting: {
            kind: "task",
            task: {
              kind: "rate",
              roundId: "round-2",
              number: 2,
              rated: 0,
              total: 2,
              closesAt: CLOSES,
            },
          },
        }}
        link={link}
      />,
    );
    const row = screen.getByRole("link");
    expect(row.textContent).toContain("Blood pressure");
    expect(row.textContent).toContain("Phase: Decide");
    expect(row.textContent).toContain("Rate round 2, 2 elements, closes Thu Nov 26");
    // The phase shows once, in words: no "phase 3 of 4".
    expect(row.textContent).not.toMatch(/of 4/);
    expect(row.textContent).not.toContain("you facilitate");
  });

  it("says the facilitator facilitates, and nothing waits quietly", () => {
    render(
      <ProjectRow
        project={{
          id: "p1",
          name: "Heart rate",
          phase: "handoff",
          role: "facilitator",
          waiting: { kind: "nothing" },
        }}
        link={link}
      />,
    );
    const row = screen.getByRole("link");
    expect(row.textContent).toContain("you facilitate");
    expect(row.textContent).toContain("Nothing for you now");
  });

  it.each<[Waiting, string | null]>([
    [{ kind: "task", task: { kind: "scope" } }, "Read the scope and comment"],
    [
      { kind: "task", task: { kind: "discover", added: 2, firstLook: { total: 0, answered: 0 } } },
      "Add your elements",
    ],
    [
      { kind: "task", task: { kind: "discover", added: 0, firstLook: { total: 4, answered: 1 } } },
      "Look at what already exists",
    ],
    [{ kind: "checklist", open: 1, next: "decide", round: null }, "1 step before Decide"],
    [{ kind: "checklist", open: 3, next: "decide", round: null }, "3 steps before Decide"],
    [{ kind: "ready", next: "handoff" }, "Ready to go on to Hand-off"],
    [{ kind: "nothing" }, null],
  ])("words %j as %j", (waiting, text) => {
    expect(waitingText(waiting, "UTC")).toBe(text);
  });

  it("names the facilitator's open round with its response and closing day", () => {
    expect(
      waitingText(
        {
          kind: "checklist",
          open: 2,
          next: "handoff",
          round: {
            id: "round-2",
            number: 2,
            status: "open",
            closesAt: CLOSES,
            completed: 3,
            raters: 8,
          },
        },
        "UTC",
      ),
    ).toBe("Round 2: 3 of 8 completed, closes Thu Nov 26");
  });
});
