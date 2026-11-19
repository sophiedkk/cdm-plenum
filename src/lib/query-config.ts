// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// How long cached data counts as fresh, in milliseconds, per area. Every query options factory
// sets its `staleTime` from this table.
// NOTE: no requirement governs these values; our own design after eduLIMS (ADR 0002).

export const STALE_TIME = {
  /** Always revalidated, so a revoked session or a new application role applies at once. */
  session: 0,
  /** The project list and one project's header: other members rarely change them. */
  projects: 30_000,
} as const;

/** The `staleTime` of a query that sets none. */
export const DEFAULT_STALE_TIME = 30_000;

/** One retry rides out a dropped connection before the route's error state shows. */
export const QUERY_RETRY = 1;
