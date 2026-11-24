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
    importedModels: 2,
    listedFromModels: 14,
    firstLookTotal: 14,
    firstLookFinished: 8,
    groupCheckAsked: true,
    groupChecked: 6,
    round: null,
    undecided: 0,
    lastClosedRound: { id: "round-1", number: 1 },
    detail: { inModel: 0, proposed: 0, settled: 0, codable: 0, codesSettled: 0, openObjections: 0 },
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
    firstLook: { total: 0, answered: 0 },
    groupCheck: { asked: false, done: false },
    round: null,
    detail: { open: 0, answered: 0, toReview: 0 },
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
  it("follows proposals, open objections and settling in the detail phase (DT1, DT2)", () => {
    const detail = (inModel: number, proposed: number, settled: number, openObjections: number) =>
      checklist(
        "detail",
        facts({
          detail: {
            inModel,
            proposed,
            settled,
            codable: inModel - 1,
            codesSettled: 1,
            openObjections,
          },
        }),
      );
    expect(detail(4, 3, 1, 2)).toEqual([
      { key: "detail_proposed", done: false, proposed: 3, inModel: 4 },
      { key: "detail_objections", done: false, count: 2 },
      { key: "detail_settled", done: false, settled: 1, inModel: 4 },
      { key: "detail_codes", done: null, settled: 1, inModel: 3 },
    ]);
    expect(openItems(detail(4, 4, 4, 0))).toBe(0);
    // Nothing in the model is nothing done: the round must include elements first.
    expect(openItems(detail(0, 0, 0, 0))).toBe(2);
  });

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

  it("offers a reminder only while someone has not finished the first look and e-mail works", () => {
    const remind = (changes: Partial<OverviewFacts>) =>
      checklist("discover", facts(changes)).find((item) => item.key === "first_look");
    expect(remind({ firstLookFinished: 5 })).toMatchObject({ done: false, remind: true });
    expect(remind({ firstLookFinished: 5, mailConfigured: false })).toMatchObject({
      remind: false,
    });
    expect(remind({})).toMatchObject({ done: true, remind: false });
    expect(remind({ firstLookTotal: 0, firstLookFinished: 0 })).toMatchObject({
      done: false,
      remind: false,
    });
    expect(remind({ participants: 0, contributors: 0 })).toMatchObject({
      done: false,
      remind: false,
    });
  });

  it("counts the participants who added elements, without a reminder", () => {
    const item = (changes: Partial<OverviewFacts>) =>
      checklist("discover", facts(changes)).find((entry) => entry.key === "contributions");
    expect(item({ contributors: 5 })).toEqual({
      key: "contributions",
      done: false,
      contributors: 5,
      participants: 8,
    });
    expect(item({})).toMatchObject({ done: true });
  });

  it("lists discover in the parts of ADR 0020", () => {
    expect(checklist("discover", facts()).map((item) => item.key)).toEqual([
      "models",
      "first_look",
      "contributions",
      "cleanup",
      "grouping",
    ]);
  });

  it("asks for the reveal only when the brainstorm starts private (EL13)", () => {
    const cleanup = (changes: Partial<OverviewFacts>) =>
      checklist("discover", facts(changes)).find((item) => item.key === "cleanup");
    expect(cleanup({ boardRevealed: false })).toEqual({
      key: "cleanup",
      done: false,
      revealed: false,
      duplicates: 0,
    });
    expect(cleanup({ privateBrainstorm: false, boardRevealed: false })).toMatchObject({
      done: true,
      revealed: null,
    });
  });

  it("marks the models and the duplicates done by their counts", () => {
    const items = checklist("discover", facts({ duplicates: 2, importedModels: 0 }));
    expect(items).toContainEqual({ key: "models", done: false, models: 0, elements: 14 });
    expect(items).toContainEqual({ key: "cleanup", done: false, revealed: true, duplicates: 2 });
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
    expect(waitingFor(facilitator, facts({ boardRevealed: false, importedModels: 0 }))).toEqual({
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
      ["detail", ["scope", "board"]],
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
