// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// How the round screens name a round and its items by the round's kind: an element round rates
// elements (DE1), a value round the values of structure proposals (DT3).
import { m } from "@/i18n/messages";
import type { RoundKind } from "@/server/rounds/round";
import { formatNumber } from "./format";

/** "Round 3", or "Value round 3"; both kinds share the numbers. */
export function roundName(round: Readonly<{ kind: RoundKind; number: number }>): string {
  return round.kind === "values"
    ? m.rounds_value_round_name({ number: round.number })
    : m.rounds_round_name({ number: round.number });
}

/** What a rater reads as an item's name: a value with its ordinal number first, as "2: Mild". */
export function shownName(item: Readonly<{ name: string; value?: { number: number | null } }>) {
  const number = item.value?.number;
  return number === undefined || number === null
    ? item.name
    : `${formatNumber(number)}: ${item.name}`;
}

/** The items with the names `shownName` gives them, for the tables and cards of a round. */
export function withShownNames<T extends { name: string; value?: { number: number | null } }>(
  items: readonly T[],
): T[] {
  return items.map((item) => ({ ...item, name: shownName(item) }));
}
