// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The consent answers of a Team project's round and the outcome they give (DE20, ADR 0023),
// used by the server and the screens so they cannot disagree.
import type { Outcome } from "./consensus";

/** The answers of one member to one element; migration 0029 holds the same values. */
export const CONSENT_ANSWERS = ["include", "leave_out", "discuss", "abstain"] as const;
export type ConsentAnswer = (typeof CONSENT_ANSWERS)[number];

/** The longest reason and settle note; migration 0029 agrees. */
export const CONSENT_TEXT_MAX = 2000;

export function isConsentAnswer(value: unknown): value is ConsentAnswer {
  return (CONSENT_ANSWERS as readonly unknown[]).includes(value);
}

/** Leave out and Discuss need a reason; Include may have one, "Unable to judge" has none. */
export function consentNeedsReason(answer: ConsentAnswer): boolean {
  return answer === "leave_out" || answer === "discuss";
}

export type ConsentCounts = Record<ConsentAnswer, number>;

export function consentCounts(answers: readonly ConsentAnswer[]): ConsentCounts {
  const counts: ConsentCounts = { include: 0, leave_out: 0, discuss: 0, abstain: 0 };
  for (const answer of answers) counts[answer] += 1;
  return counts;
}

/**
 * The outcome of an element after the round closes. Every answer Include: in the model. Every
 * answer Leave out: not. Any other mix, or no answer, is "To discuss", stored as `no_consensus`
 * until the facilitator settles it. "Unable to judge" is not counted.
 */
export function consentOutcome(answers: readonly ConsentAnswer[]): Outcome {
  const counted = answers.filter((answer) => answer !== "abstain");
  if (counted.length === 0) return "no_consensus";
  if (counted.every((answer) => answer === "include")) return "included";
  if (counted.every((answer) => answer === "leave_out")) return "excluded";
  return "no_consensus";
}
