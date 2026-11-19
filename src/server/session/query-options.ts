// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The session in the TanStack Query cache, read by the root route on every navigation.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { getSessionFn } from "./functions.ts";

export const sessionKeys = {
  all: ["session"] as const,
};

/** The signed-in user with their application roles, or `null`. */
export function sessionQueryOptions() {
  return queryOptions({
    queryKey: sessionKeys.all,
    queryFn: () => getSessionFn(),
    staleTime: STALE_TIME.session,
    // The guards decide on this answer, so a failure shows the error state at once.
    retry: false,
  });
}

export type SessionData = Awaited<ReturnType<typeof getSessionFn>>;
