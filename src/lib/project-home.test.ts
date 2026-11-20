// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { participantAccess } from "./phase-access.ts";
import {
  type ChecklistRound,
  checklist,
  decidedGroups,
  homePages,
  type OverviewFacts,
  openItems,
  waitingFor,
} from "./project-home.ts";
import { PROJECT_PHASES } from "./project-phases.ts";
import type { ProjectOverview } from "./project-tasks.ts";

function facts(changes: Partial<OverviewFacts> = {}): OverviewFacts {
  return {
    scopeWritten: true,
    scopeComments: 0,
    panelMissing: 0,
    participants: 8,
    contributors: 8,
    elements: 11,
    privateBrainstorm: true,
    boardRevealed: true,
    duplicates: 0,
    ckmLinked: 2,
    round: null,
    undecided: 0,
    lastClosedRound: { id: "round-1", number: 1 },
    mailConfigured: true,
    ...changes,
  };
}

function overview(changes: Partial<ProjectOverview> = {}): ProjectOverview {
  return {
    phase: "decide",
    role: "participant",
    elements: 8,
    ownElements: 0,
    round: null,
    lastClosedRoundId: null,
    ...changes,
  };
}

const OPEN_ROUND: ChecklistRound = {
  id: "round-2",
  number: 2,
  status: "open",
  closesAt: "2026-11-26T22:05:00.000Z",
  completed: 3,
  raters: 8,
};

describe("checklist (PR4)", () => {
  it("lists the scope, the panel and the comments in the scope phase", () => {
    const items = checklist(
      "scope",
      facts({ scopeWritten: false, panelMissing: 2, scopeComments: 3 }),
    );
    expect(items).toEqual([
      { key: "scope_written", done: false },
      { key: "panel", done: false, missing: 2 },
      { key: "scope_comments", done: null, count: 3 },
    ]);
    // A comment count only informs; nothing marks comments read.
    expect(openItems(items)).toBe(2);
  });

  it("offers a reminder only while someone has not added and e-mail works", () => {
    const remind = (changes: Partial<OverviewFacts>) =>
      checklist("discover", facts(changes)).find((item) => item.key === "contributions");
    expect(remind({ contributors: 5 })).toMatchObject({ done: false, remind: true });
    expect(remind({ contributors: 5, mailConfigured: false })).toMatchObject({ remind: false });
    expect(remind({})).toMatchObject({ done: true, remind: false });
    expect(remind({ participants: 0, contributors: 0 })).toMatchObject({
      done: false,
      remind: false,
    });
  });

  it("asks for the reveal only when the brainstorm starts private (EL13)", () => {
    const keys = (changes: Partial<OverviewFacts>) =>
      checklist("discover", facts(changes)).map((item) => item.key);
    expect(keys({})).toEqual(["contributions", "reveal", "duplicates", "compare"]);
    expect(keys({ privateBrainstorm: false })).toEqual(["contributions", "duplicates", "compare"]);
    expect(
      checklist("discover", facts({ boardRevealed: false })).find((item) => item.key === "reveal"),
    ).toEqual({ key: "reveal", done: false });
  });

  it("marks duplicates and the comparison done by their counts", () => {
    const items = checklist("discover", facts({ duplicates: 2, ckmLinked: 0 }));
    expect(items).toContainEqual({ key: "duplicates", done: false, count: 2 });
    expect(items).toContainEqual({ key: "compare", done: false, linked: 0 });
  });

  it("follows the round and the undecided elements in the decide phase", () => {
    expect(checklist("decide", facts({ round: OPEN_ROUND, undecided: 4 }))).toEqual([
      { key: "round", done: false, round: OPEN_ROUND, closed: { id: "round-1", number: 1 } },
      { key: "undecided", done: false, count: 4 },
    ]);
    // Every element decided and no round running: nothing left but the move on.
    const done = checklist("decide", facts());
    expect(done).toEqual([{ key: "undecided", done: true, count: 0 }]);
    expect(openItems(done)).toBe(0);
  });

  it("has no checklist in hand-off, which exports", () => {
    expect(checklist("handoff", facts())).toEqual([]);
  });
});

describe("waitingFor (PR8)", () => {
  it("names a participant's task while it asks something of them", () => {
    expect(waitingFor(overview({ phase: "scope" }), null)).toEqual({
      kind: "task",
      task: { kind: "scope" },
    });
    const rating = waitingFor(
      overview({
        round: {
          id: "round-2",
          number: 2,
          status: "open",
          closesAt: OPEN_ROUND.closesAt,
          elements: 2,
          rated: 0,
          completed: null,
          raters: null,
        },
      }),
      null,
    );
    expect(rating).toMatchObject({ kind: "task", task: { kind: "rate", total: 2, rated: 0 } });
  });

  it("says nothing waits when the round is rated in full or none is open", () => {
    expect(waitingFor(overview(), null)).toEqual({ kind: "nothing" });
    expect(waitingFor(overview({ phase: "handoff" }), null)).toEqual({ kind: "nothing" });
  });

  it("counts the facilitator's open items before the next phase, or says they are ready", () => {
    const facilitator = overview({ role: "facilitator", phase: "discover" });
    expect(waitingFor(facilitator, facts({ boardRevealed: false, duplicates: 1 }))).toEqual({
      kind: "checklist",
      open: 2,
      next: "decide",
      round: null,
    });
    expect(waitingFor(facilitator, facts())).toEqual({ kind: "ready", next: "decide" });
    expect(waitingFor(overview({ role: "facilitator", phase: "handoff" }), facts())).toEqual({
      kind: "nothing",
    });
  });

  it("names the facilitator's open round with its response", () => {
    const deciding = overview({ role: "facilitator", phase: "decide" });
    expect(waitingFor(deciding, facts({ round: OPEN_ROUND, undecided: 2 }))).toMatchObject({
      kind: "checklist",
      round: OPEN_ROUND,
    });
  });
});

describe("decidedGroups (PR8)", () => {
  it("groups the elements in the order in, not in, still open, not rated, leaving out empty ones", () => {
    const groups = decidedGroups([
      { id: "a", name: "Comment", status: "not_rated" },
      { id: "b", name: "Systolic", status: "included" },
      { id: "c", name: "Cuff size", status: "no_consensus" },
      { id: "d", name: "Diastolic", status: "included" },
    ]);
    expect(groups.map((group) => [group.status, group.elements.map((e) => e.name)])).toEqual([
      ["included", ["Systolic", "Diastolic"]],
      ["no_consensus", ["Cuff size"]],
      ["not_rated", ["Comment"]],
    ]);
  });
});

describe("homePages (PR9, ADR 0019)", () => {
  it("links the scope and the elements from discover on, and nothing extra in scope", () => {
    expect(PROJECT_PHASES.map((phase) => [phase, homePages(phase)])).toEqual([
      ["scope", []],
      ["discover", ["scope", "board"]],
      ["decide", ["scope", "board"]],
      ["handoff", ["scope", "board"]],
    ]);
  });

  it("only links a page the phase table shows a participant", () => {
    for (const phase of PROJECT_PHASES) {
      for (const page of homePages(phase)) {
        expect(participantAccess(phase, page)).not.toBe("hidden");
      }
    }
  });
});
