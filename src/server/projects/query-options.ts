// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the project screens. A mutation invalidates keys from this
// factory, never the whole cache.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { getProjectFn, listGroupMembersFn, listGroupsFn, listProjectsFn } from "./functions.ts";

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (projectId: string) => [...projectKeys.all, "detail", projectId] as const,
  /** Everything about the stakeholder groups of one project; invalidate this after a change. */
  groups: (projectId: string) => [...projectKeys.detail(projectId), "groups"] as const,
  groupCounts: (projectId: string) => [...projectKeys.groups(projectId), "counts"] as const,
  groupMembers: (projectId: string) => [...projectKeys.groups(projectId), "members"] as const,
};

/** The stakeholder groups with the number of participants, for any member (PR6). */
export function groupsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.groupCounts(projectId),
    queryFn: () => listGroupsFn({ data: { projectId } }),
    staleTime: STALE_TIME.members,
  });
}

/** The stakeholder groups with their participants by name, for the facilitator (PR3). */
export function groupMembersQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.groupMembers(projectId),
    queryFn: () => listGroupMembersFn({ data: { projectId } }),
    staleTime: STALE_TIME.members,
  });
}

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
