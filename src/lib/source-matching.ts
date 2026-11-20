// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Matches the elements of several source models into candidate rows for the coverage table
// (EL20, ADR 0016). NOTE: no spec governs the matching; our own design. Only a shared element
// code is applied; a shared NL-CM id and a similar name are suggestions the facilitator decides.
import { foldName, nameSimilarity } from "./brainstorm.ts";

/** The part of a source element the matching reads. */
export interface MatchableElement {
  id: string;
  name: string;
  codeSystem: string | null;
  code: string | null;
  nlCmId: string | null;
}

/** One source model and its elements, in the order its source lists them. */
export interface MatchableModel<E extends MatchableElement = MatchableElement> {
  id: string;
  elements: readonly E[];
}

/**
 * Why the elements of a row belong together: the same element `code` (applied), the same
 * NL-CM id (`mapping`) or a similar `name` (both suggested), or `none` for an element that
 * matched nothing.
 */
export type MatchBasis = "code" | "mapping" | "name" | "none";

export interface CoverageRow<E extends MatchableElement = MatchableElement> {
  basis: MatchBasis;
  /** Whether the match counts without the facilitator: only a code match does. */
  applied: boolean;
  /** The shared code as `system|code`, the shared NL-CM id, or null. */
  key: string | null;
  /** The matched elements per model id, in each model's order; a model without one is absent. */
  cells: Record<string, E[]>;
}

/** The score from which two names suggest a match; stricter than the quick-add hints. */
export const NAME_MATCH_THRESHOLD = 0.75;

/** `measuringLocation` and `MeasuringLocation` read as "measuring location". */
function words(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2").replace(/[_[\]]+/g, " ");
}

/** How alike two element names are, from 0 to 1, the same both ways. */
export function elementNameSimilarity(a: string, b: string): number {
  const left = words(a);
  const right = words(b);
  if (foldName(left) === foldName(right)) return 1;
  return Math.max(nameSimilarity(left, right), nameSimilarity(right, left));
}

interface Entry<E> {
  modelId: string;
  order: number;
  element: E;
}

function modelsOf<E>(entries: readonly Entry<E>[]): Set<string> {
  return new Set(entries.map((entry) => entry.modelId));
}

function row<E extends MatchableElement>(
  basis: MatchBasis,
  key: string | null,
  entries: readonly Entry<E>[],
): { first: number; row: CoverageRow<E> } {
  const sorted = [...entries].sort((a, b) => a.order - b.order);
  const cells: Record<string, E[]> = {};
  for (const entry of sorted) {
    const cell = cells[entry.modelId];
    if (cell) cell.push(entry.element);
    else cells[entry.modelId] = [entry.element];
  }
  return {
    first: sorted[0]?.order ?? 0,
    row: { basis, applied: basis === "code", key, cells },
  };
}

/**
 * Groups the elements of `models` into rows, in three passes over the elements still free:
 * 1. the same element code (system and code) in two or more models: an applied row;
 * 2. the same NL-CM id in two or more models: a suggested row;
 * 3. names at least `NAME_MATCH_THRESHOLD` alike, at most one element per model, the most
 *    alike pair first: a suggested row.
 * Every element ends up in exactly one row; one that matched nothing gets a row of its own.
 * Rows follow the first element they hold, in model order and then element order.
 */
export function matchSourceElements<E extends MatchableElement>(
  models: readonly MatchableModel<E>[],
): CoverageRow<E>[] {
  const entries: Entry<E>[] = [];
  for (const model of models) {
    for (const element of model.elements) {
      entries.push({ modelId: model.id, order: entries.length, element });
    }
  }
  const taken = new Set<number>();
  const rows: { first: number; row: CoverageRow<E> }[] = [];

  const byKey = (basis: "code" | "mapping", keyOf: (element: E) => string | null) => {
    const groups = new Map<string, Entry<E>[]>();
    for (const entry of entries) {
      if (taken.has(entry.order)) continue;
      const key = keyOf(entry.element);
      if (key === null) continue;
      const group = groups.get(key);
      if (group) group.push(entry);
      else groups.set(key, [entry]);
    }
    for (const [key, group] of groups) {
      if (modelsOf(group).size < 2) continue;
      for (const entry of group) taken.add(entry.order);
      rows.push(row(basis, key, group));
    }
  };

  byKey("code", (element) =>
    element.codeSystem !== null && element.code !== null
      ? `${element.codeSystem}|${element.code}`
      : null,
  );
  byKey("mapping", (element) => element.nlCmId);

  // Pass 3: join the most alike free pairs from different models into clusters, so a cluster
  // never holds two elements of one model.
  const free = entries.filter((entry) => !taken.has(entry.order));
  const pairs: { a: Entry<E>; b: Entry<E>; score: number }[] = [];
  for (let i = 0; i < free.length; i++) {
    for (let j = i + 1; j < free.length; j++) {
      const a = free[i] as Entry<E>;
      const b = free[j] as Entry<E>;
      if (a.modelId === b.modelId) continue;
      const score = elementNameSimilarity(a.element.name, b.element.name);
      if (score >= NAME_MATCH_THRESHOLD) pairs.push({ a, b, score });
    }
  }
  pairs.sort((x, y) => y.score - x.score || x.a.order - y.a.order || x.b.order - y.b.order);
  const cluster = new Map<number, Entry<E>[]>();
  for (const { a, b } of pairs) {
    const left = cluster.get(a.order) ?? [a];
    const right = cluster.get(b.order) ?? [b];
    if (left === right) continue;
    const leftModels = modelsOf(left);
    if (right.some((entry) => leftModels.has(entry.modelId))) continue;
    const joined = [...left, ...right];
    for (const entry of joined) cluster.set(entry.order, joined);
  }
  for (const group of new Set(cluster.values())) {
    for (const entry of group) taken.add(entry.order);
    rows.push(row("name", null, group));
  }

  for (const entry of entries) {
    if (!taken.has(entry.order)) rows.push(row("none", null, [entry]));
  }
  return rows.sort((a, b) => a.first - b.first).map((entry) => entry.row);
}
