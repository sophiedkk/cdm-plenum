// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The outcome of one element in one round (DE1, DE5), used by the round page and every export so
// they cannot disagree (docs/architecture.md#consensus-calculation).

/** A round's consensus rule, as stored on the round. Percentages may carry two decimals. */
export interface ConsensusRule {
  scaleMin: number;
  scaleMax: number;
  /** The bottom band runs from scaleMin up to and including this score. */
  bottomBandMax: number;
  /** The top band runs from this score up to and including scaleMax. */
  topBandMin: number;
  agreementPct: number;
  oppositionPct: number;
}

/** The default rule of DE1, from the COMET Handbook (https://doi.org/10.1186/s13063-017-1978-4). */
export const DEFAULT_RULE: ConsensusRule = {
  scaleMin: 1,
  scaleMax: 9,
  bottomBandMax: 3,
  topBandMin: 7,
  agreementPct: 70,
  oppositionPct: 15,
};

export type RuleError =
  | "scale_not_integer"
  | "scale_too_short"
  | "bands_outside_scale"
  | "bands_overlap"
  | "agreement_not_above_half"
  | "opposition_not_below_agreement";

/** Checks a rule the way the database's round checks do; returns the first problem or null. */
export function ruleError(rule: ConsensusRule): RuleError | null {
  const scores = [rule.scaleMin, rule.scaleMax, rule.bottomBandMax, rule.topBandMin];
  if (!scores.every(Number.isInteger)) return "scale_not_integer";
  if (rule.scaleMin >= rule.scaleMax) return "scale_too_short";
  if (rule.bottomBandMax < rule.scaleMin || rule.topBandMin > rule.scaleMax) {
    return "bands_outside_scale";
  }
  if (rule.bottomBandMax >= rule.topBandMin) return "bands_overlap";
  if (!(rule.agreementPct > 50 && rule.agreementPct <= 100)) return "agreement_not_above_half";
  if (!(rule.oppositionPct >= 0 && rule.oppositionPct < rule.agreementPct)) {
    return "opposition_not_below_agreement";
  }
  return null;
}

export type Outcome = "included" | "excluded" | "no_consensus";

export interface ElementResult {
  /** Everyone who answered, including "unable to rate". */
  responses: number;
  /** Answers with a score. The percentages are shares of this number. */
  rated: number;
  unableToRate: number;
  /** Count per score, for every score on the scale, lowest first. */
  distribution: { score: number; count: number }[];
  /** Null when nobody gave a score. */
  median: number | null;
  topPct: number;
  bottomPct: number;
  outcome: Outcome;
}

// Percentages are compared in hundredths of a percent, in integers, so 70.00% of 10 is exactly 7.
function atLeast(count: number, rated: number, pct: number): boolean {
  return count * 10_000 >= Math.round(pct * 100) * rated;
}

function atMost(count: number, rated: number, pct: number): boolean {
  return count * 10_000 <= Math.round(pct * 100) * rated;
}

function median(sorted: readonly number[]): number | null {
  const n = sorted.length;
  if (n === 0) return null;
  const middle = Math.floor(n / 2);
  const upper = sorted[middle] ?? 0;
  return n % 2 === 1 ? upper : ((sorted[middle - 1] ?? 0) + upper) / 2;
}

/**
 * The result of one element. `null` is "unable to rate": it counts as a response, not toward the
 * percentages.
 * NOTE: no source consulted settles how "unable to rate" counts; our own design, stated in the
 * decision report.
 *
 * @throws Error on a rule that fails `ruleError` or a score outside the scale.
 */
export function elementResult(
  scores: readonly (number | null)[],
  rule: ConsensusRule,
): ElementResult {
  const problem = ruleError(rule);
  if (problem) throw new Error(`invalid consensus rule: ${problem}`);
  const given: number[] = [];
  for (const score of scores) {
    if (score === null) continue;
    if (!Number.isInteger(score) || score < rule.scaleMin || score > rule.scaleMax) {
      throw new Error(`score outside the scale: ${score}`);
    }
    given.push(score);
  }
  given.sort((a, b) => a - b);
  const rated = given.length;
  const top = given.filter((score) => score >= rule.topBandMin).length;
  const bottom = given.filter((score) => score <= rule.bottomBandMax).length;
  const distribution = [];
  for (let score = rule.scaleMin; score <= rule.scaleMax; score++) {
    distribution.push({ score, count: given.filter((value) => value === score).length });
  }
  let outcome: Outcome = "no_consensus";
  if (rated > 0) {
    if (atLeast(top, rated, rule.agreementPct) && atMost(bottom, rated, rule.oppositionPct)) {
      outcome = "included";
    } else if (
      atLeast(bottom, rated, rule.agreementPct) &&
      atMost(top, rated, rule.oppositionPct)
    ) {
      outcome = "excluded";
    }
  }
  return {
    responses: scores.length,
    rated,
    unableToRate: scores.length - rated,
    distribution,
    median: median(given),
    topPct: rated === 0 ? 0 : (top / rated) * 100,
    bottomPct: rated === 0 ? 0 : (bottom / rated) * 100,
    outcome,
  };
}

/** Q-PRIV-3: a stakeholder group's own result is shown only from this many scores on. */
export const MIN_GROUP_SCORES = 3;

/**
 * The result per stakeholder group, leaving out every group with fewer than
 * {@link MIN_GROUP_SCORES} scores; those still count in the overall result.
 */
export function groupResults(
  scoresByGroup: ReadonlyMap<string, readonly (number | null)[]>,
  rule: ConsensusRule,
): Map<string, ElementResult> {
  const shown = new Map<string, ElementResult>();
  for (const [group, scores] of scoresByGroup) {
    const result = elementResult(scores, rule);
    if (result.rated >= MIN_GROUP_SCORES) shown.set(group, result);
  }
  return shown;
}
