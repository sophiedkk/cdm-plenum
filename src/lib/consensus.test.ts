// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  type ConsensusRule,
  DEFAULT_RULE,
  elementResult,
  groupResults,
  MIN_GROUP_SCORES,
  ruleError,
} from "./consensus";

/** n copies of a score. */
const times = (n: number, score: number | null) => Array.from({ length: n }, () => score);

describe("ruleError", () => {
  it("accepts the default rule", () => {
    expect(ruleError(DEFAULT_RULE)).toBeNull();
  });

  it.each<[Partial<ConsensusRule>, string]>([
    [{ scaleMax: 9.5 }, "scale_not_integer"],
    [{ scaleMin: 9, scaleMax: 9 }, "scale_too_short"],
    [{ bottomBandMax: 0 }, "bands_outside_scale"],
    [{ topBandMin: 10 }, "bands_outside_scale"],
    [{ bottomBandMax: 7, topBandMin: 7 }, "bands_overlap"],
    [{ agreementPct: 50 }, "agreement_not_above_half"],
    [{ agreementPct: 101 }, "agreement_not_above_half"],
    [{ oppositionPct: 70 }, "opposition_not_below_agreement"],
    [{ oppositionPct: -1 }, "opposition_not_below_agreement"],
  ])("refuses %o with %s", (change, error) => {
    expect(ruleError({ ...DEFAULT_RULE, ...change })).toBe(error);
  });
});

describe("elementResult with the default rule", () => {
  it("includes at exactly 70% in 7 to 9 and 15% or less in 1 to 3", () => {
    // 20 scores: 14 top (70%), 3 bottom (15%), 3 middle.
    const result = elementResult([...times(14, 8), ...times(3, 2), ...times(3, 5)], DEFAULT_RULE);
    expect(result.outcome).toBe("included");
    expect(result.topPct).toBe(70);
    expect(result.bottomPct).toBe(15);
  });

  it("has no consensus just below 70% in the top band", () => {
    // 10 scores: 6 top (60%).
    expect(elementResult([...times(6, 9), ...times(4, 5)], DEFAULT_RULE).outcome).toBe(
      "no_consensus",
    );
  });

  it("has no consensus when the top band reaches 70% but more than 15% score 1 to 3", () => {
    // 10 scores: 7 top, 2 bottom (20%).
    expect(elementResult([...times(7, 7), ...times(2, 1), 5], DEFAULT_RULE).outcome).toBe(
      "no_consensus",
    );
  });

  it("excludes at 70% in 1 to 3 and 15% or less in 7 to 9", () => {
    expect(elementResult([...times(8, 1), 5, 9], DEFAULT_RULE).outcome).toBe("excluded");
  });

  it("counts unable to rate as a response, not toward the percentages", () => {
    const result = elementResult([...times(7, 8), ...times(3, null)], DEFAULT_RULE);
    expect(result.responses).toBe(10);
    expect(result.rated).toBe(7);
    expect(result.unableToRate).toBe(3);
    expect(result.topPct).toBe(100);
    expect(result.outcome).toBe("included");
  });

  it("has no consensus, no median and zero percentages without any score", () => {
    const result = elementResult(times(2, null), DEFAULT_RULE);
    expect(result).toMatchObject({ rated: 0, median: null, topPct: 0, bottomPct: 0 });
    expect(result.outcome).toBe("no_consensus");
  });

  it("gives the full distribution over the scale, including empty scores", () => {
    const result = elementResult([1, 9, 9], DEFAULT_RULE);
    expect(result.distribution).toHaveLength(9);
    expect(result.distribution[0]).toEqual({ score: 1, count: 1 });
    expect(result.distribution[4]).toEqual({ score: 5, count: 0 });
    expect(result.distribution[8]).toEqual({ score: 9, count: 2 });
  });

  it("takes the median of the middle pair for an even number of scores", () => {
    expect(elementResult([2, 9, 4, 7], DEFAULT_RULE).median).toBe(5.5);
    expect(elementResult([3, 8, 5], DEFAULT_RULE).median).toBe(5);
  });

  it("throws on a score outside the scale or not a whole number", () => {
    expect(() => elementResult([10], DEFAULT_RULE)).toThrow("score outside the scale: 10");
    expect(() => elementResult([0], DEFAULT_RULE)).toThrow("score outside the scale: 0");
    expect(() => elementResult([4.5], DEFAULT_RULE)).toThrow("score outside the scale: 4.5");
  });

  it("throws on an invalid rule", () => {
    expect(() => elementResult([5], { ...DEFAULT_RULE, agreementPct: 40 })).toThrow(
      "invalid consensus rule: agreement_not_above_half",
    );
  });
});

describe("elementResult with an adjusted rule (DE1)", () => {
  it("uses a 1 to 5 scale with 80% agreement", () => {
    const rule: ConsensusRule = {
      scaleMin: 1,
      scaleMax: 5,
      bottomBandMax: 2,
      topBandMin: 4,
      agreementPct: 80,
      oppositionPct: 10,
    };
    expect(elementResult([...times(8, 5), 3, 3], rule).outcome).toBe("included");
    expect(elementResult([...times(7, 5), 3, 3, 3], rule).outcome).toBe("no_consensus");
  });

  it("compares two-decimal percentages exactly", () => {
    // 2 of 3 is 66.67% after rounding, but strictly below 66.67.
    const rule = { ...DEFAULT_RULE, agreementPct: 66.67, oppositionPct: 0 };
    expect(elementResult([9, 9, 5], rule).outcome).toBe("no_consensus");
    expect(elementResult([9, 9, 5], { ...rule, agreementPct: 66.66 }).outcome).toBe("included");
  });
});

describe("groupResults (Q-PRIV-3)", () => {
  it("shows a group only from MIN_GROUP_SCORES scores on", () => {
    expect(MIN_GROUP_SCORES).toBe(3);
    const results = groupResults(
      new Map([
        ["nursing", [8, 9, 7]],
        ["terminology", [8, 9]],
        ["patient", [8, 9, null]],
      ]),
      DEFAULT_RULE,
    );
    expect([...results.keys()]).toEqual(["nursing"]);
    expect(results.get("nursing")?.outcome).toBe("included");
  });
});
