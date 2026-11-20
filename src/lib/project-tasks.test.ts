// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { type OverviewRound, type ProjectOverview, participantTask } from "./project-tasks.ts";

const CLOSES = "2026-12-01T16:00:00.000Z";

function overview(changes: Partial<ProjectOverview> = {}): ProjectOverview {
  return {
    phase: "scope",
    role: "participant",
    elements: 8,
    ownElements: 3,
    firstLook: { total: 0, answered: 0 },
    groupCheck: { asked: false, done: false },
    round: null,
    lastClosedRoundId: null,
    ...changes,
  };
}

function round(changes: Partial<OverviewRound> = {}): OverviewRound {
  return {
    id: "round-2",
    number: 2,
    status: "open",
    closesAt: CLOSES,
    elements: 40,
    rated: 12,
    completed: null,
    raters: null,
    ...changes,
  };
}

describe("participantTask (PR8)", () => {
  it("asks to read the scope in the scope phase", () => {
    expect(participantTask(overview())).toEqual({ kind: "scope" });
  });

  it("counts only the participant's own elements in the discover phase", () => {
    expect(participantTask(overview({ phase: "discover" }))).toEqual({
      kind: "discover",
      added: 3,
      firstLook: { total: 0, answered: 0 },
      groupCheck: { asked: false, done: false },
    });
  });

  it("carries the participant's first look in the discover phase (EL22)", () => {
    const firstLook = { total: 14, answered: 5 };
    expect(participantTask(overview({ phase: "discover", firstLook }))).toMatchObject({
      kind: "discover",
      firstLook,
    });
  });

  it("asks to rate an open round, with the count and the closing date", () => {
    expect(participantTask(overview({ phase: "decide", round: round() }))).toEqual({
      kind: "rate",
      roundId: "round-2",
      number: 2,
      rated: 12,
      total: 40,
      closesAt: CLOSES,
    });
  });

  it("says all is rated once every element has an answer", () => {
    const task = participantTask(overview({ phase: "decide", round: round({ rated: 40 }) }));
    expect(task).toMatchObject({ kind: "rated_all", total: 40, closesAt: CLOSES });
  });

  it("has nothing to rate after the closing date, before the facilitator closes", () => {
    const task = participantTask(
      overview({ phase: "decide", round: round({ status: "awaiting_close" }) }),
    );
    expect(task).toEqual({ kind: "round_closing", number: 2 });
  });

  it("has nothing to do while deciding without an open round", () => {
    expect(participantTask(overview({ phase: "decide" }))).toEqual({ kind: "wait" });
  });

  it("has nothing to rate for a member who does not rate (DE14)", () => {
    const task = participantTask(overview({ phase: "decide", round: round({ rated: null }) }));
    expect(task).toEqual({ kind: "wait" });
  });

  it("points to the last results in the hand-off phase", () => {
    expect(participantTask(overview({ phase: "handoff", lastClosedRoundId: "round-1" }))).toEqual({
      kind: "handoff",
      resultsRoundId: "round-1",
    });
  });
});
