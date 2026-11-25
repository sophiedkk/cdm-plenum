// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { DEFAULT_RULE } from "./consensus";
import { type DecisionReport, ruleText, writeDecisionReport } from "./decision-report";

const REPORT: DecisionReport = {
  projectName: "Blood pressure",
  generatedOn: "2026-11-25",
  scope: { concept: "Blood pressure", useCases: "", outOfScope: "" },
  panel: [{ name: "Nursing", expertType: "clinical", invited: 4, started: 0, completed: 0 }],
  rounds: [
    {
      number: 1,
      kind: "elements",
      status: "closed",
      rule: DEFAULT_RULE,
      openedAt: "2026-11-01T10:00:00.000Z",
      closesAt: "2026-11-08T10:00:00.000Z",
      closedAt: "2026-11-08T10:00:00.000Z",
      groups: [{ name: "Nursing", expertType: "clinical", invited: 4, started: 4, completed: 4 }],
      total: { invited: 4, started: 4, completed: 4 },
      items: [{ name: "Cuff size", outcome: "included", median: 8, rated: 4 }],
    },
    {
      number: 2,
      kind: "values",
      status: "open",
      rule: DEFAULT_RULE,
      openedAt: "2026-11-10T10:00:00.000Z",
      closesAt: "2026-11-17T10:00:00.000Z",
      closedAt: null,
      groups: [{ name: null, expertType: null, invited: 2, started: 1, completed: 0 }],
      total: { invited: 6, started: 5, completed: 4 },
      items: [],
    },
  ],
  elements: [],
  merged: [],
};

describe("writeDecisionReport (EX3)", () => {
  it("writes the parts in the order of the ACCORD checklist", () => {
    const text = writeDecisionReport(REPORT);
    const positions = [
      "# Decision report",
      "## Aim and scope",
      "## Panel",
      "## Consensus method and rules",
      "## Rounds and response",
      "## Outcome per element",
      "## Items removed or changed",
    ].map((heading) => text.indexOf(heading));
    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
  });

  it("shows a value round as a round of its own kind, without outcomes until it closes", () => {
    const text = writeDecisionReport(REPORT);
    expect(text).toContain("Objective: rating of the proposed values of elements.");
    expect(text).toContain("closing date 2026-11-17, not closed yet");
    expect(text.slice(text.indexOf("## Outcome per element"))).not.toContain("### Round 2");
  });

  it("states what is not stated and merges unnamed groups", () => {
    const text = writeDecisionReport(REPORT);
    expect(text).toContain("**Use cases:** not stated");
    expect(text).toContain("| Other groups (a group of fewer than 3 is not named) | 2 | 1 | 0 |");
  });

  it("describes the default rule in words", () => {
    expect(ruleText(DEFAULT_RULE)).toBe(
      "Scores run from 1 to 9. An item is included when at least 70% of the scores are 7 to 9 and at most 15% are 1 to 3. It is excluded when at least 70% are 1 to 3 and at most 15% are 7 to 9. Otherwise there is no consensus.",
    );
  });
});
