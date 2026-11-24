// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the development sign-in page.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { devSignInEnabledFn, devSignInPeopleFn } from "./functions.ts";

export const devSignInKeys = {
  all: ["dev-sign-in"] as const,
  enabled: () => [...devSignInKeys.all, "enabled"] as const,
  people: () => [...devSignInKeys.all, "people"] as const,
};

/** Whether DEV_SIGN_IN is on; it changes only with a restart of the server. */
export function devSignInEnabledQueryOptions() {
  return queryOptions({
    queryKey: devSignInKeys.enabled(),
    queryFn: () => devSignInEnabledFn(),
    staleTime: STALE_TIME.devSignInSetting,
  });
}

/** Every active account, grouped; refused as `not_found` with the setting off. */
export function devSignInPeopleQueryOptions() {
  return queryOptions({
    queryKey: devSignInKeys.people(),
    queryFn: () => devSignInPeopleFn(),
    staleTime: STALE_TIME.devSignIn,
  });
}
