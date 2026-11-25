// @vitest-environment jsdom
// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's Overview (PR4, PR10, ADR 0019): the checklist per phase with a check and its
// state in words per item, at most one outline action each, one main button on to the next
// phase and a quiet link back, each confirmed in the page below the buttons.
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import type { OverviewFacts } from "@/lib/project-home";
import type { ProjectPhase } from "@/lib/project-phases";
import { OverviewChecklist } from "./overview-checklist";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function resolve(to: string, params: Record<string, string>): string {
  return Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), to);
}

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params = {},
    search,
    hash,
    children,
    className,
  }: {
    to: string;
    params?: Record<string, string>;
    search?: Record<string, unknown>;
    hash?: string;
    children: ReactNode;
    className?: string;
  }) => {
    const query = search ? `?${new URLSearchParams(search as Record<string, string>)}` : "";
    return (
      <a href={`${resolve(to, params)}${query}${hash ? `#${hash}` : ""}`} className={className}>
        {children}
      </a>
    );
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  overwriteGetLocale(() => baseLocale);
});

function facts(changes: Partial<OverviewFacts> = {}): OverviewFacts {
  return {
    scopeWritten: true,
    modelTypeSet: true,
    scopeComments: 0,
    panelMissing: 0,
    participants: 8,
    contributors: 5,
    elements: 11,
    privateBrainstorm: true,
    boardRevealed: false,
    duplicates: 2,
    importedModels: 0,
    listedFromModels: 0,
    firstLookTotal: 14,
    firstLookFinished: 6,
    groupCheckAsked: false,
    groupChecked: 0,
    round: null,
    valueRound: null,
    undecided: 0,
    lastClosedRound: null,
    detail: { inModel: 0, proposed: 0, settled: 0, codable: 0, codesSettled: 0, openObjections: 0 },
    mailConfigured: true,
    ...changes,
  };
}

function renderOverview(
  phase: ProjectPhase,
  changes: Partial<OverviewFacts> = {},
  props: {
    move?: ReturnType<typeof vi.fn>;
    remind?: ReturnType<typeof vi.fn>;
    reveal?: (primary: boolean) => ReactNode;
  } = {},
) {
  const move = props.move ?? vi.fn(async () => ({ ok: true, value: { phase: "decide" } }));
  const onMoved = vi.fn();
  render(
    <OverviewChecklist
      projectId="p1"
      phase={phase}
      facts={facts(changes)}
      reveal={props.reveal}
      remind={props.remind as never}
      move={move as never}
      onMoved={onMoved}
    />,
  );
  return { move, onMoved };
}

/** The text of every filled (suggested) button or link on the page. */
function filledButtons() {
  return [...document.querySelectorAll("a, button")]
    .filter((node) => node.className.includes("bg-primary"))
    .map((node) => node.textContent);
}

/** Each item's state in words, its text and its actions. */
function items() {
  return within(screen.getByRole("list"))
    .getAllByRole("listitem")
    .map((item) => {
      const state = item.querySelector(".sr-only")?.textContent ?? "";
      const actions = within(item)
        .queryAllByRole("link")
        .concat(within(item).queryAllByRole("button"))
        .map((action) => action.textContent);
      return { state, text: item.textContent, actions };
    });
}

describe("the checklist per phase", () => {
  it("lists the scope phase: scope written, model type chosen, panel invited, comments to read", () => {
    renderOverview("scope", {
      scopeWritten: false,
      modelTypeSet: false,
      panelMissing: 2,
      scopeComments: 3,
    });
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "Before you go on to Discover",
    );
    expect(items()).toEqual([
      {
        state: "To do",
        text: "To doWrite the scope statementGo to the scope",
        actions: ["Go to the scope"],
      },
      {
        state: "To do",
        text: "To doChoose the model typeGo to the scope",
        actions: ["Go to the scope"],
      },
      {
        state: "To do",
        text: "To doInvite 2 more people for the minimum panelInvite people",
        actions: ["Invite people"],
      },
      {
        state: "",
        text: "3 comments on the scopeRead the comments",
        actions: ["Read the comments"],
      },
    ]);
    expect(screen.getByRole("link", { name: "Read the comments" }).getAttribute("href")).toBe(
      "/projects/p1/scope#scope-comments",
    );
  });

  it("marks done items with a check and its state in words, without an action", () => {
    renderOverview("scope");
    const [scope, modelType, panel] = items();
    expect(scope).toEqual({
      state: "Done",
      text: "DoneThe scope statement is written",
      actions: [],
    });
    expect(modelType).toEqual({
      state: "Done",
      text: "DoneThe model type is chosen",
      actions: [],
    });
    expect(panel?.state).toBe("Done");
  });

  it("lists the discover phase in its parts: models, what is missing, reveal and clean up", () => {
    const reveal = () => <button type="button">Reveal the board</button>;
    renderOverview("discover", {}, { reveal, remind: vi.fn() });
    expect(items().map((item) => [item.state, item.text, item.actions])).toEqual([
      [
        "To do",
        "To doStart from existing models. Import the models that already describe the concept.Add models",
        ["Add models"],
      ],
      [
        "To do",
        "To doParticipants go through the list. 6 of 8 done.Send a reminder",
        ["Send a reminder"],
      ],
      [
        "To do",
        "To doAdd what is missing. 5 of 8 participants added elementsOpen the board",
        ["Open the board"],
      ],
      [
        "To do",
        "To doReveal and clean up. Reveal the board, then merge the duplicates people marked.Reveal the board",
        ["Reveal the board"],
      ],
      [
        "To do",
        "To doGroup the elements. You or a modeller put each element in a group; participants check it.Group",
        ["Group"],
      ],
    ]);
    expect(screen.getByRole("link", { name: "Add models" }).getAttribute("href")).toBe(
      "/projects/p1/models",
    );
    expect(screen.getByRole("link", { name: "Open the board" }).getAttribute("href")).toBe(
      "/projects/p1/brainstorm",
    );
  });

  it("shows the imported models and, after the reveal, the duplicates to merge", () => {
    renderOverview("discover", { importedModels: 3, listedFromModels: 14, boardRevealed: true });
    const [models, , , cleanup] = items();
    expect(models).toEqual({
      state: "Done",
      text: "DoneStart from existing models. 3 models imported: 14 elements on the list.Review",
      actions: ["Review"],
    });
    expect(cleanup?.text).toContain("2 likely duplicate pairs to review");
    expect(
      screen.getAllByRole("link", { name: "Review" }).map((link) => link.getAttribute("href")),
    ).toEqual(["/projects/p1/models", "/projects/p1/board?duplicates=true"]);
  });

  it("offers no reminder without e-mail", () => {
    renderOverview("discover", { mailConfigured: false }, { remind: vi.fn() });
    expect(screen.queryByRole("button", { name: "Send a reminder" })).toBeNull();
  });

  it("sends the reminder and says to how many", async () => {
    const remind = vi.fn(async () => ({ ok: true, value: { sent: 3 } }));
    renderOverview("discover", {}, { remind });
    fireEvent.click(screen.getByRole("button", { name: "Send a reminder" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Reminder sent to 3 participants."),
    );
  });

  it("shows a refused reminder as a translated message", async () => {
    const remind = vi.fn(async () => ({ ok: false, error: "mail_not_configured" }));
    renderOverview("discover", {}, { remind });
    fireEvent.click(screen.getByRole("button", { name: "Send a reminder" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "This server cannot send e-mail, so no reminder went out.",
      ),
    );
  });

  it("follows the open round with its response and closing date in the decide phase", () => {
    renderOverview("decide", {
      round: {
        id: "round-2",
        number: 2,
        status: "open",
        closesAt: "2026-11-26T22:05:00.000Z",
        completed: 3,
        raters: 8,
      },
      undecided: 2,
    });
    const [round, undecided] = items();
    expect(round?.text).toContain("Round 2: 3 of 8 completed.");
    expect(round?.actions).toEqual(["Go to round 2"]);
    expect(undecided?.text).toContain("2 elements still without consensus");
  });

  it("counts settled elements in words that fit one and many", () => {
    for (const [settled, text] of [
      [1, "Settled: 1 of 3 elements"],
      [3, "Settled: 3 of 3 elements"],
    ] as const) {
      cleanup();
      renderOverview("detail", {
        detail: {
          inModel: 3,
          proposed: 3,
          settled,
          codable: 0,
          codesSettled: 0,
          openObjections: 0,
        },
      });
      expect(items().some((item) => item.text?.includes(text))).toBe(true);
    }
  });

  it("words one element and one participant in the singular", () => {
    renderOverview("detail", {
      detail: {
        inModel: 1,
        proposed: 0,
        settled: 0,
        codable: 1,
        codesSettled: 0,
        openObjections: 0,
      },
    });
    const text = items().map((item) => item.text);
    expect(text.some((t) => t?.includes("0 of 1 element has a structure proposal"))).toBe(true);
    expect(text.some((t) => t?.includes("Settled: 0 of 1 element"))).toBe(true);
    expect(text.some((t) => t?.includes("Settled codes: 0 of 1 element;"))).toBe(true);
    cleanup();
    renderOverview("discover", { participants: 1, contributors: 0 });
    expect(items().some((item) => item.text?.includes("0 of 1 participant added elements"))).toBe(
      true,
    );
  });

  it("links the open decide work: the round, and the board for the elements", () => {
    renderOverview("decide", { undecided: 2 });
    expect(screen.getByRole("link", { name: "Open the board" }).getAttribute("href")).toBe(
      "/projects/p1/board",
    );
    expect(filledButtons()).toEqual(["New round"]);
  });

  it("asks to set up the next round while elements wait for a decision", () => {
    renderOverview("decide", { undecided: 4, lastClosedRound: { id: "round-1", number: 1 } });
    expect(screen.getByText("Set up round 2")).toBeTruthy();
    expect(screen.getByRole("link", { name: "New round" }).getAttribute("href")).toBe(
      "/projects/p1/rounds/new",
    );
  });

  it("shows the hand-off in hand-off: a status line, the next step and the downloads (F4)", () => {
    renderOverview("handoff", {
      detail: {
        inModel: 5,
        proposed: 5,
        settled: 4,
        codable: 4,
        codesSettled: 1,
        openObjections: 0,
      },
    });
    expect(screen.queryByRole("link", { name: "Go to the hand-off" })).toBeNull();
    expect(screen.getByText("4 of 5 structures settled, 3 codes open")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open details" }).getAttribute("href")).toBe(
      "/projects/p1/details",
    );
    // The decision report is the one filled button; the other downloads are outline.
    const filled = [...document.querySelectorAll("a, button")].filter((node) =>
      node.className.includes("bg-primary"),
    );
    expect(filled.map((node) => node.textContent)).toEqual(["Download Decision report"]);
    expect(screen.queryByRole("button", { name: /Go on to/ })).toBeNull();
    expect(screen.getByRole("button", { name: "Move back to Detail" })).toBeTruthy();
  });
});

describe("the phase move (PR4)", () => {
  it("fills the first open item's link, and outlines the phase move while an item is open", () => {
    renderOverview("discover", {}, { remind: vi.fn() });
    expect(filledButtons()).toEqual(["Add models"]);
    expect(
      screen.getByRole("button", { name: "Go on to Decide" }).getAttribute("data-variant"),
    ).toBe("outline");
  });

  it("fills the next open item when the first is done", () => {
    renderOverview("discover", { importedModels: 2, listedFromModels: 9 }, { remind: vi.fn() });
    expect(filledButtons()).toEqual(["Send a reminder"]);
  });

  it("fills the phase move once every item is done, and no item action", () => {
    renderOverview("scope");
    expect(filledButtons()).toEqual(["Go on to Discover"]);
  });

  it("does not fill an item that only informs", () => {
    renderOverview("scope", { scopeComments: 3 });
    expect(filledButtons()).toEqual(["Go on to Discover"]);
  });

  it("lists what stays open in the confirmation of the move on", () => {
    renderOverview("scope", { scopeWritten: false, panelMissing: 1 });
    fireEvent.click(screen.getByRole("button", { name: "Go on to Discover" }));
    const open = within(screen.getByRole("group")).getAllByRole("listitem");
    expect(open.map((item) => item.textContent)).toEqual([
      "Write the scope statement",
      "Invite 1 more person for the minimum panel",
    ]);
  });

  it("lists nothing in the confirmation when every item is done, nor when moving back", () => {
    renderOverview("scope");
    fireEvent.click(screen.getByRole("button", { name: "Go on to Discover" }));
    expect(within(screen.getByRole("group")).queryByRole("list")).toBeNull();
    cleanup();
    renderOverview("discover");
    fireEvent.click(screen.getByRole("button", { name: "Move back to Scope" }));
    expect(within(screen.getByRole("group")).queryByRole("list")).toBeNull();
  });

  it("asks before moving on, below the buttons, and moves after the confirmation", async () => {
    const { move, onMoved } = renderOverview("discover");
    const goOn = screen.getByRole("button", { name: "Go on to Decide" });
    const back = screen.getByRole("button", { name: "Move back to Scope" });
    fireEvent.click(goOn);
    expect(goOn.getAttribute("aria-expanded")).toBe("true");
    const question = screen.getByText(/Move the project on to Decide\?/);
    await waitFor(() => expect(document.activeElement).toBe(question));
    // The confirmation follows the row of buttons, which stays as it was.
    const row = goOn.parentElement as HTMLElement;
    expect(row.contains(back)).toBe(true);
    const group = screen.getByRole("group");
    expect(row.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(move).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, move to Decide" }));
    await waitFor(() => expect(move).toHaveBeenCalledWith("next"));
    await waitFor(() => expect(onMoved).toHaveBeenCalled());
    expect(toast.success).toHaveBeenCalledWith("The project is now in the phase Decide.");
  });

  it("asks before moving back with its own confirmation, and cancels without moving", async () => {
    const { move } = renderOverview("discover");
    const back = screen.getByRole("button", { name: "Move back to Scope" });
    fireEvent.click(back);
    expect(screen.getByText(/Move the project back to Scope\?/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group")).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(back));
    expect(move).not.toHaveBeenCalled();
  });

  it("shows a refusal, such as a round still open (PR10), and stays", async () => {
    const move = vi.fn(async () => ({ ok: false, error: "round_still_open" }));
    const { onMoved } = renderOverview("decide", {}, { move });
    fireEvent.click(screen.getByRole("button", { name: "Go on to Detail" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, move to Detail" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onMoved).not.toHaveBeenCalled();
    expect(screen.getByRole("group")).toBeTruthy();
  });

  it("speaks Dutch when the locale is Dutch", () => {
    overwriteGetLocale(() => "nl");
    renderOverview("discover");
    expect(screen.getByRole("button", { name: "Door naar Besluiten" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Terugzetten naar Scope" })).toBeTruthy();
  });
});
