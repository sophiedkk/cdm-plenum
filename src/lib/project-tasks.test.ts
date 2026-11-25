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
    detail: { open: 0, answered: 0, toReview: 0, toPropose: 0, toProposeCodes: 0 },
    lastClosedRoundId: null,
    ...changes,
  };
}

function round(changes: Partial<OverviewRound> = {}): OverviewRound {
  return {
    id: "round-2",
    kind: "elements",
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
      roundKind: "elements",
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

  it("asks a participant to answer the open structure proposals in the detail phase (DT2)", () => {
    const detail = (open: number, answered: number) =>
      participantTask(
        overview({
          phase: "detail",
          detail: { open, answered, toReview: 0, toPropose: 0, toProposeCodes: 0 },
        }),
      );
    expect(detail(3, 1)).toEqual({
      kind: "detail",
      open: 3,
      answered: 1,
      toReview: 0,
      toPropose: 0,
      toProposeCodes: 0,
    });
    expect(detail(3, 3)).toEqual({ kind: "detail_answered" });
    expect(detail(0, 0)).toEqual({ kind: "wait" });
  });

  it("asks to rate an open value round before the answers in the detail phase (DT3)", () => {
    const valueRound = round({ kind: "values", number: 3, elements: 6, rated: 2 });
    const task = participantTask(
      overview({
        phase: "detail",
        round: valueRound,
        detail: { open: 3, answered: 0, toReview: 0, toPropose: 0, toProposeCodes: 0 },
      }),
    );
    expect(task).toEqual({
      kind: "rate",
      roundKind: "values",
      roundId: "round-2",
      number: 3,
      rated: 2,
      total: 6,
      closesAt: CLOSES,
    });
  });

  it("goes back to the answers once every value is rated, or the round waits to close (DT3)", () => {
    const detail = { open: 3, answered: 0, toReview: 0, toPropose: 0, toProposeCodes: 0 };
    const rated = round({ kind: "values", elements: 6, rated: 6 });
    expect(participantTask(overview({ phase: "detail", round: rated, detail }))).toMatchObject({
      kind: "detail",
    });
    const closing = round({ kind: "values", status: "awaiting_close", rated: 1 });
    expect(participantTask(overview({ phase: "detail", round: closing, detail }))).toMatchObject({
      kind: "detail",
    });
  });

  it("ignores a value round in the decide phase (DT3)", () => {
    const valueRound = round({ kind: "values" });
    expect(participantTask(overview({ phase: "decide", round: valueRound }))).toEqual({
      kind: "wait",
    });
  });

  it("keeps a terminologist's task open while codes wait for their review (DT4)", () => {
    const task = participantTask(
      overview({
        phase: "detail",
        detail: { open: 2, answered: 2, toReview: 1, toPropose: 0, toProposeCodes: 0 },
      }),
    );
    expect(task).toEqual({
      kind: "detail",
      open: 2,
      answered: 2,
      toReview: 1,
      toPropose: 0,
      toProposeCodes: 0,
    });
  });

  it("keeps an expert's task open while proposals wait to be made (DT1, DT4)", () => {
    const base = { open: 0, answered: 0, toReview: 0, toPropose: 0, toProposeCodes: 0 };
    const task = (detail: typeof base) => participantTask(overview({ phase: "detail", detail }));
    expect(task({ ...base, toPropose: 2 })).toEqual({ kind: "detail", ...base, toPropose: 2 });
    expect(task({ ...base, open: 1, answered: 1, toProposeCodes: 1 })).toMatchObject({
      kind: "detail",
    });
  });

  it("gives the facilitator no answer task in the detail phase: they settle (DT2)", () => {
    const task = participantTask(
      overview({
        phase: "detail",
        role: "facilitator",
        detail: { open: 3, answered: 0, toReview: 0, toPropose: 0, toProposeCodes: 0 },
      }),
    );
    expect(task).toEqual({ kind: "wait" });
  });

  it("points to the last results in the hand-off phase", () => {
    expect(participantTask(overview({ phase: "handoff", lastClosedRoundId: "round-1" }))).toEqual({
      kind: "handoff",
      resultsRoundId: "round-1",
    });
  });
});
