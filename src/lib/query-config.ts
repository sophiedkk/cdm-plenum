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
  /** The scope statement and its comments: members comment while they read. */
  scope: 10_000,
  /** The element board: several members add elements at the same time. */
  board: 10_000,
  /** CKM answers: the server caches them for a day, so the browser need not ask again soon. */
  ckm: 300_000,
  /** Stakeholder groups, members and invitations: the facilitator's own changes invalidate them. */
  members: 30_000,
  /** The administration page: always revalidated, so a change by another administrator shows. */
  admin: 0,
  /** Rounds, ratings and results: participants rate while the facilitator watches the response. */
  rounds: 10_000,
  /**
   * The project overview: always revalidated, since its counts change on the board and rating
   * pages, whose mutations do not invalidate it.
   */
  overview: 0,
} as const;

/** The `staleTime` of a query that sets none. */
export const DEFAULT_STALE_TIME = 30_000;

/** One retry rides out a dropped connection before the route's error state shows. */
export const QUERY_RETRY = 1;
