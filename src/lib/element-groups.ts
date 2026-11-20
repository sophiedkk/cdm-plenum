// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The groups of elements (EL18, EL24, DE19, ADR 0020): their limits, and the order a participant
// sees them in a round.
import type { ElementPrompt } from "./brainstorm.ts";

/** The longest group name and "something missing" remark; migration 0014 agrees. */
export const ELEMENT_GROUP_NAME_MAX = 80;
export const GROUP_MISSING_MAX = 500;

/** A group as every page shows it: a name of its own, or the name of its starting question. */
export interface GroupLabel {
  name: string | null;
  prompt: ElementPrompt | null;
}

/** A string hash (FNV-1a, 32 bits), the seed of the group order. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    value ^= text.charCodeAt(i);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value;
}

/** A small seeded generator (mulberry32), so the same seed gives the same order. */
function generator(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The groups in an order of their own for one participant in one round (DE19): random, and the
 * same each time for the same seed, such as the rating code and the round id. Brookes et al. 2018
 * (<https://doi.org/10.1186/s13063-017-2405-6>) found the order of grouped blocks changes which
 * items are kept; a different order per participant spreads that effect.
 */
// NOTE: no spec governs the shuffle; our own design: Fisher-Yates on a seeded generator.
export function groupOrder<T>(groups: readonly T[], seed: string): T[] {
  const next = generator(hash(seed));
  const order = [...groups];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const swap = order[i] as T;
    order[i] = order[j] as T;
    order[j] = swap;
  }
  return order;
}
