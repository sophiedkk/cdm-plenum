// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the project screens. A mutation invalidates keys from this
// factory, never the whole cache.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { getProjectFn, listProjectsFn } from "./functions.ts";

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (projectId: string) => [...projectKeys.all, "detail", projectId] as const,
};

/** The projects of the signed-in user, with their role and the phase. */
export function projectsQueryOptions() {
  return queryOptions({
    queryKey: projectKeys.list(),
    queryFn: () => listProjectsFn(),
    staleTime: STALE_TIME.projects,
  });
}

/** One project and the user's role in it, or the `not_found` refusal. */
export function projectQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.detail(projectId),
    queryFn: () => getProjectFn({ data: { projectId } }),
    staleTime: STALE_TIME.projects,
  });
}
