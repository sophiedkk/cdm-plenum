// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the element board (EL1 to EL9). A mutation invalidates keys from
// this factory, never the whole cache.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { listArchetypeElementsFn } from "../ckm/functions.ts";
import {
  listElementCommentsFn,
  listElementCommentsWithAuthorsFn,
  listElementsFn,
  listElementsWithAuthorsFn,
} from "./functions.ts";

export const elementKeys = {
  all: (projectId: string) => ["elements", projectId] as const,
  board: (projectId: string) => [...elementKeys.all(projectId), "board"] as const,
  comments: (projectId: string, elementId: string) =>
    [...elementKeys.all(projectId), "comments", elementId] as const,
  archetype: (projectId: string, cid: string) =>
    [...elementKeys.all(projectId), "ckm", cid] as const,
};

/**
 * The elements on the board. Only the facilitator asks for the authors (EL2, ADR 0005); a
 * participant's answer has no author field at all, and the key keeps the two answers apart.
 */
export function boardQueryOptions(projectId: string, withAuthors: boolean) {
  return queryOptions({
    queryKey: [...elementKeys.board(projectId), withAuthors ? "authors" : "public"] as const,
    queryFn: async () => {
      if (withAuthors) return listElementsWithAuthorsFn({ data: { projectId } });
      const result = await listElementsFn({ data: { projectId } });
      return result.ok
        ? {
            ok: true as const,
            value: result.value.map((element) => ({ ...element, author: null })),
          }
        : result;
    },
    staleTime: STALE_TIME.board,
  });
}

/** The comments under one element, with authors for the facilitator only (EL6). */
export function elementCommentsQueryOptions(
  projectId: string,
  elementId: string,
  withAuthors: boolean,
) {
  return queryOptions({
    queryKey: [
      ...elementKeys.comments(projectId, elementId),
      withAuthors ? "authors" : "public",
    ] as const,
    queryFn: async () => {
      const data = { projectId, elementId };
      if (withAuthors) return listElementCommentsWithAuthorsFn({ data });
      const result = await listElementCommentsFn({ data });
      return result.ok
        ? {
            ok: true as const,
            value: result.value.map((comment) => ({ ...comment, author: null })),
          }
        : result;
    },
    staleTime: STALE_TIME.board,
  });
}

/** The current revision of a CKM archetype with its elements (EL4, EL7). */
export function archetypeElementsQueryOptions(projectId: string, cid: string) {
  return queryOptions({
    queryKey: elementKeys.archetype(projectId, cid),
    queryFn: () => listArchetypeElementsFn({ data: { projectId, cid } }),
    staleTime: STALE_TIME.ckm,
    // A CKM failure is an answer (`ok: false`), not an error, so there is nothing to retry.
    retry: false,
  });
}
