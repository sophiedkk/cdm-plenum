// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the scope page (SC1, SC2). A mutation invalidates keys from this
// factory, never the whole cache.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { getScopeFn, listScopeCommentsFn, listScopeCommentsWithAuthorsFn } from "./functions.ts";

export const scopeKeys = {
  all: (projectId: string) => ["scope", projectId] as const,
  statement: (projectId: string) => [...scopeKeys.all(projectId), "statement"] as const,
  comments: (projectId: string) => [...scopeKeys.all(projectId), "comments"] as const,
};

/** The scope statement with its ordered sources. */
export function scopeQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: scopeKeys.statement(projectId),
    queryFn: () => getScopeFn({ data: { projectId } }),
    staleTime: STALE_TIME.scope,
  });
}

/**
 * The comments on the scope. Only the facilitator asks for the authors (SC2, ADR 0005); the
 * key keeps the two answers apart, so a participant's cache never holds an author.
 */
export function scopeCommentsQueryOptions(projectId: string, withAuthors: boolean) {
  return queryOptions({
    queryKey: [...scopeKeys.comments(projectId), withAuthors ? "authors" : "public"] as const,
    queryFn: async () => {
      if (withAuthors) return listScopeCommentsWithAuthorsFn({ data: { projectId } });
      const result = await listScopeCommentsFn({ data: { projectId } });
      return result.ok
        ? {
            ok: true as const,
            value: result.value.map((comment) => ({ ...comment, author: null })),
          }
        : result;
    },
    staleTime: STALE_TIME.scope,
  });
}
