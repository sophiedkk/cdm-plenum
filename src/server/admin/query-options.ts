// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the administration page. A mutation invalidates keys from this
// factory, never the whole cache.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { listAccountsFn, listActivityFn, listAppRolesFn } from "./functions.ts";

export const adminKeys = {
  all: ["admin"] as const,
  appRoles: () => [...adminKeys.all, "app-roles"] as const,
  accounts: () => [...adminKeys.all, "accounts"] as const,
  activityAll: () => [...adminKeys.all, "activity"] as const,
  activity: (action: string | undefined) => [...adminKeys.activityAll(), action ?? ""] as const,
};

/** The addresses with an application right. */
export function appRolesQueryOptions() {
  return queryOptions({
    queryKey: adminKeys.appRoles(),
    queryFn: () => listAppRolesFn(),
    staleTime: STALE_TIME.admin,
  });
}

/** Every account with its state. */
export function accountsQueryOptions() {
  return queryOptions({
    queryKey: adminKeys.accounts(),
    queryFn: () => listAccountsFn(),
    staleTime: STALE_TIME.admin,
  });
}

/** The newest activity log entries, of one action when `action` is set. */
export function activityQueryOptions(action: string | undefined) {
  return queryOptions({
    queryKey: adminKeys.activity(action),
    queryFn: () => listActivityFn({ data: action === undefined ? {} : { action } }),
    staleTime: STALE_TIME.admin,
  });
}
