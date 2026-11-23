// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the source models (EL12, EL20). A mutation invalidates keys from
// this factory, never the whole cache.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { listSourceModelsWithAuthorsFn, sourceCoverageFn } from "./functions.ts";

export const sourceKeys = {
  all: (projectId: string) => ["sources", projectId] as const,
  models: (projectId: string) => [...sourceKeys.all(projectId), "models"] as const,
  coverage: (projectId: string) => [...sourceKeys.all(projectId), "coverage"] as const,
};

/** The source models and suggestions with who added each (facilitator only, EL2). */
export function sourceModelsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: sourceKeys.models(projectId),
    queryFn: () => listSourceModelsWithAuthorsFn({ data: { projectId } }),
    staleTime: STALE_TIME.board,
  });
}

/** The coverage table of the imported models (facilitator only, EL20). */
export function sourceCoverageQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: sourceKeys.coverage(projectId),
    queryFn: () => sourceCoverageFn({ data: { projectId } }),
    staleTime: STALE_TIME.board,
  });
}
