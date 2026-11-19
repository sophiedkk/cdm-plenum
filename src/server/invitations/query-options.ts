// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the invitation list on the members page. A mutation invalidates keys
// from this factory, never the whole cache.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { projectKeys } from "../projects/query-options.ts";
import { listInvitationsFn } from "./functions.ts";

export const invitationKeys = {
  list: (projectId: string) => [...projectKeys.detail(projectId), "invitations"] as const,
};

/** The invitations of a project, newest first, for the facilitator (PR3). */
export function invitationsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: invitationKeys.list(projectId),
    queryFn: () => listInvitationsFn({ data: { projectId } }),
    staleTime: STALE_TIME.members,
  });
}
