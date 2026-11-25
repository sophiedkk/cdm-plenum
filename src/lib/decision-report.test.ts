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
      panel: [
        { expertType: "clinical", raters: 4, minimum: 2 },
        { expertType: "terminology", raters: 2, minimum: 1 },
        { expertType: "architecture", raters: 0, minimum: 1 },
      ],
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
      panel: null,
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

  it("writes the panel per expert type at opening, a count of 1 or 2 as fewer than 3 (DE12)", () => {
    const text = writeDecisionReport(REPORT);
    expect(text).toContain("| clinical | 4 | 2 |");
    expect(text).toContain("| terminology | fewer than 3 | 1 |");
    expect(text).toContain("| architecture | 0 | 1 |");
  });

  it("leaves the panel table out of a round that stored none", () => {
    const text = writeDecisionReport({ ...REPORT, rounds: REPORT.rounds.slice(1) });
    expect(text).not.toContain("Expert type | Raters | Minimum");
  });

  it("writes the units of an element, joined with a semicolon", () => {
    const text = writeDecisionReport({
      ...REPORT,
      elements: [
        {
          name: "Systolic",
          outcome: "included",
          detail: {
            dataType: "quantity",
            cardinality: "1..1",
            units: ["mm[Hg]", "kPa"],
            group: null,
            code: null,
            codesSettled: null,
          },
        },
      ],
    });
    expect(text).toContain("| Systolic | included | quantity | 1..1 | mm[Hg]; kPa |");
  });

  it("describes the default rule in words", () => {
    expect(ruleText(DEFAULT_RULE)).toBe(
      "Scores run from 1 to 9. An item is included when at least 70% of the scores are 7 to 9 and at most 15% are 1 to 3. It is excluded when at least 70% are 1 to 3 and at most 15% are 7 to 9. Otherwise there is no consensus.",
    );
  });
});
