// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the project screens. A mutation invalidates keys from this
// factory, never the whole cache.
import { queryOptions } from "@tanstack/react-query";
import type { ProjectPhase } from "@/lib/project-phases";
import { STALE_TIME } from "@/lib/query-config";
import {
  decidedSoFarFn,
  getProjectFn,
  listGroupMembersFn,
  listGroupsFn,
  listProjectRowsFn,
  overviewFactsFn,
  phaseRecapFn,
  projectOverviewFn,
} from "./functions.ts";

export const projectKeys = {
  all: ["projects"] as const,
  list: () => [...projectKeys.all, "list"] as const,
  detail: (projectId: string) => [...projectKeys.all, "detail", projectId] as const,
  /** Everything about the stakeholder groups of one project; invalidate this after a change. */
  groups: (projectId: string) => [...projectKeys.detail(projectId), "groups"] as const,
  groupCounts: (projectId: string) => [...projectKeys.groups(projectId), "counts"] as const,
  groupMembers: (projectId: string) => [...projectKeys.groups(projectId), "members"] as const,
  overview: (projectId: string) => [...projectKeys.detail(projectId), "overview"] as const,
  /** The facilitator's checklist facts; a change on any project page can change them. */
  facts: (projectId: string) => [...projectKeys.overview(projectId), "facts"] as const,
  decided: (projectId: string) => [...projectKeys.overview(projectId), "decided"] as const,
  recap: (projectId: string, phase: ProjectPhase) =>
    [...projectKeys.detail(projectId), "recap", phase] as const,
};

/** The phase, the user's own task counts and, for the facilitator, the status (PR4, PR8). */
export function projectOverviewQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.overview(projectId),
    queryFn: () => projectOverviewFn({ data: { projectId } }),
    staleTime: STALE_TIME.overview,
  });
}

/** The facts of the facilitator's Overview checklist (PR4). */
export function overviewFactsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.facts(projectId),
    queryFn: () => overviewFactsFn({ data: { projectId } }),
    staleTime: STALE_TIME.overview,
  });
}

/** Where each element of the board stands, for the participant's home (PR8). */
export function decidedSoFarQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: projectKeys.decided(projectId),
    queryFn: () => decidedSoFarFn({ data: { projectId } }),
    staleTime: STALE_TIME.overview,
  });
}

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

/** The projects of the signed-in user, with their role, the phase and what waits for them. */
export function projectsQueryOptions() {
  return queryOptions({
    queryKey: projectKeys.list(),
    queryFn: () => listProjectRowsFn(),
    // What waits changes on every project page, so the list is read again on each visit.
    staleTime: STALE_TIME.overview,
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

/** The read-only recap of a done phase (PR13). */
export function phaseRecapQueryOptions(projectId: string, phase: ProjectPhase) {
  return queryOptions({
    queryKey: projectKeys.recap(projectId, phase),
    queryFn: () => phaseRecapFn({ data: { projectId, phase } }),
    staleTime: STALE_TIME.projects,
  });
}
