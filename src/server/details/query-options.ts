// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the detail phase (DT1, DT2). A mutation invalidates keys from this
// factory and `projectKeys.overview`, whose counts the home and the Overview show.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { detailBoardFn, treeBoardFn } from "./functions.ts";

export const detailKeys = {
  all: (projectId: string) => ["details", projectId] as const,
  board: (projectId: string) => [...detailKeys.all(projectId), "board"] as const,
  tree: (projectId: string) => [...detailKeys.all(projectId), "tree"] as const,
};

/** The tree step for the signed-in member (DT6). */
export function treeBoardQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: detailKeys.tree(projectId),
    queryFn: () => treeBoardFn({ data: { projectId } }),
    staleTime: STALE_TIME.details,
  });
}

/** The structure step for the signed-in member. */
export function detailBoardQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: detailKeys.board(projectId),
    queryFn: () => detailBoardFn({ data: { projectId } }),
    staleTime: STALE_TIME.details,
  });
}
