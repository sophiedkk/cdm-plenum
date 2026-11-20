// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The brainstorm questions (EL14) and the similar-name hints of the quick-add form (EL15).

/**
 * The four questions, in the order the page shows them. They follow the parts of an openEHR
 * OBSERVATION: `data`, `state` and `protocol`, plus the context of use (openEHR EHR Information
 * Model, <https://specifications.openehr.org/releases/RM/latest/ehr.html>).
 */
export const ELEMENT_PROMPTS = ["recorded", "patient_state", "method", "context"] as const;
export type ElementPrompt = (typeof ELEMENT_PROMPTS)[number];

export function isElementPrompt(value: unknown): value is ElementPrompt {
  return typeof value === "string" && (ELEMENT_PROMPTS as readonly string[]).includes(value);
}

/**
 * Whether participants see only their own elements now (EL13): the setting is on and the
 * facilitator has not revealed the board. The server decides this again on every read.
 */
export function isPrivateStep(project: {
  privateBrainstorm: boolean;
  boardRevealed: boolean;
}): boolean {
  return project.privateBrainstorm && !project.boardRevealed;
}

/** The most hints the quick-add form lists. */
export const SIMILAR_MAX = 5;

/** A typed name shorter than this, without spaces, gets no hints. */
const QUERY_MIN = 3;

/** Words that say nothing about the element, in English and Dutch. */
const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "by",
  "for",
  "in",
  "of",
  "on",
  "or",
  "the",
  "to",
  "with",
  "de",
  "een",
  "en",
  "het",
  "in",
  "met",
  "op",
  "of",
  "van",
  "voor",
]);

/** Lower case without accents, so "Hémoglobine" and "hemoglobine" compare equal. */
export function foldName(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

function tokens(text: string): string[] {
  return foldName(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 0 && !STOPWORDS.has(token));
}

function trigrams(text: string): Set<string> {
  const padded = `  ${foldName(text).replace(/[^\p{L}\p{N}]+/gu, " ")} `;
  const set = new Set<string>();
  for (let i = 0; i + 3 <= padded.length; i++) set.add(padded.slice(i, i + 3));
  return set;
}

/** The Sørensen–Dice coefficient of the character trigrams; catches small typing errors. */
function trigramDice(a: string, b: string): number {
  const left = trigrams(a);
  const right = trigrams(b);
  if (left.size === 0 || right.size === 0) return 0;
  let shared = 0;
  for (const gram of left) if (right.has(gram)) shared++;
  return (2 * shared) / (left.size + right.size);
}

/**
 * The share of the typed words found in `name`. A typed word of 3 or more letters also matches
 * the start of a word, so a hint appears while the participant is still typing.
 */
function tokenOverlap(typed: string, name: string): number {
  const wanted = tokens(typed);
  if (wanted.length === 0) return 0;
  const have = tokens(name);
  const found = wanted.filter((word) =>
    have.some((other) => other === word || (word.length >= QUERY_MIN && other.startsWith(word))),
  );
  return found.length / wanted.length;
}

/** How similar a typed name is to an element name, from 0 to 1. */
export function nameSimilarity(typed: string, name: string): number {
  return Math.max(tokenOverlap(typed, name), trigramDice(typed, name));
}

/** The score from which a name counts as similar. */
export const SIMILAR_THRESHOLD = 0.5;

/**
 * Up to `SIMILAR_MAX` elements whose name is like `typed`, the most similar first. No spec
 * governs the measure; our own design: word overlap or trigram similarity, without a database
 * extension.
 */
export function similarElements<T extends { name: string }>(
  typed: string,
  elements: readonly T[],
): T[] {
  if (foldName(typed).replace(/\s+/g, "").length < QUERY_MIN) return [];
  return elements
    .map((element) => ({ element, score: nameSimilarity(typed, element.name) }))
    .filter((entry) => entry.score >= SIMILAR_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.element.name.localeCompare(b.element.name))
    .slice(0, SIMILAR_MAX)
    .map((entry) => entry.element);
}
