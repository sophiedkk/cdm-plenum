// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { notFound } from "@tanstack/react-router";

/**
 * The value of a server result a page needs. A record that does not exist, or that the user may
 * not see, is the not-found page; any other refusal is the route's error state.
 */
export function valueOrNotFound<T>(
  result: { ok: true; value: T } | { ok: false; error: string },
): T {
  if (result.ok) return result.value;
  if (result.error === "not_found" || result.error === "round_not_found") throw notFound();
  throw new Error(`refused: ${result.error}`);
}
