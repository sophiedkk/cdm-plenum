// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the element board (EL1 to EL9). A mutation invalidates keys from
// this factory, never the whole cache.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { listArchetypeElementsFn } from "../ckm/functions.ts";
import {
  brainstormBoardFn,
  brainstormStatusFn,
  firstLookFn,
  firstLookSummaryFn,
  groupCheckFn,
  groupingBoardFn,
  listElementCommentsFn,
  listElementCommentsWithAuthorsFn,
  listElementsFn,
  listElementsWithAuthorsFn,
  listOwnElementsFn,
  listOwnMarksFn,
  markSummaryFn,
} from "./functions.ts";

export const elementKeys = {
  all: (projectId: string) => ["elements", projectId] as const,
  board: (projectId: string) => [...elementKeys.all(projectId), "board"] as const,
  own: (projectId: string) => [...elementKeys.all(projectId), "own"] as const,
  brainstorm: (projectId: string) => [...elementKeys.all(projectId), "brainstorm"] as const,
  /** The brainstorm board with its columns and counts (EL23). */
  questionBoard: (projectId: string) => [...elementKeys.all(projectId), "question-board"] as const,
  /** The grouping, the facilitator's board and the participant's check of it (EL18, EL24). */
  groups: (projectId: string) => [...elementKeys.all(projectId), "groups"] as const,
  /** The member's first look and, for the facilitator, its counts (EL22). */
  firstLook: (projectId: string) => [...elementKeys.all(projectId), "first-look"] as const,
  /** The member's own marks and, for the facilitator, the counts (EL16). */
  marks: (projectId: string) => [...elementKeys.all(projectId), "marks"] as const,
  comments: (projectId: string, elementId: string) =>
    [...elementKeys.all(projectId), "comments", elementId] as const,
  archetype: (projectId: string, cid: string) =>
    [...elementKeys.all(projectId), "ckm", cid] as const,
};

/**
 * The elements on the board. Only the facilitator asks for the authors (EL2, ADR 0005); a
 * participant's answer has no author field at all, unless the project is a Team (PR14), and
 * the key keeps the two answers apart.
 */
export function boardQueryOptions(projectId: string, withAuthors: boolean) {
  return queryOptions({
    queryKey: [...elementKeys.board(projectId), withAuthors ? "authors" : "public"] as const,
    queryFn: async () => {
      if (withAuthors) return listElementsWithAuthorsFn({ data: { projectId } });
      return listElementsFn({ data: { projectId } });
    },
    staleTime: STALE_TIME.board,
  });
}

/** The elements the signed-in member added, for the brainstorm page (EL14). */
export function ownElementsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: elementKeys.own(projectId),
    queryFn: () => listOwnElementsFn({ data: { projectId } }),
    staleTime: STALE_TIME.board,
  });
}

/** The private step with the elements per participant, for the facilitator (EL13). */
export function brainstormStatusQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: elementKeys.brainstorm(projectId),
    queryFn: () => brainstormStatusFn({ data: { projectId } }),
    staleTime: STALE_TIME.board,
  });
}

/** The signed-in member's own "I support this" and "same as" marks (EL16). */
export function ownMarksQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: [...elementKeys.marks(projectId), "own"] as const,
    queryFn: () => listOwnMarksFn({ data: { projectId } }),
    staleTime: STALE_TIME.board,
  });
}

/** The supporters per element and the proposed duplicates, as counts (facilitator only, EL16). */
export function markSummaryQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: [...elementKeys.marks(projectId), "summary"] as const,
    queryFn: () => markSummaryFn({ data: { projectId } }),
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
      return listElementCommentsFn({ data });
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

/** The elements from existing models with the member's own answers (EL22). */
export function firstLookQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: [...elementKeys.firstLook(projectId), "own"] as const,
    queryFn: () => firstLookFn({ data: { projectId } }),
    staleTime: STALE_TIME.board,
  });
}

/** The answers per element as counts (facilitator only, EL22). */
export function firstLookSummaryQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: [...elementKeys.firstLook(projectId), "summary"] as const,
    queryFn: () => firstLookSummaryFn({ data: { projectId } }),
    staleTime: STALE_TIME.board,
  });
}

/** The brainstorm board: one column per question, others' elements as counts before the reveal. */
export function brainstormBoardQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: elementKeys.questionBoard(projectId),
    queryFn: () => brainstormBoardFn({ data: { projectId } }),
    staleTime: STALE_TIME.board,
  });
}

/** The grouping with the participants' remarks, for the facilitator (EL18, EL24). */
export function groupingBoardQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: [...elementKeys.groups(projectId), "board"] as const,
    queryFn: () => groupingBoardFn({ data: { projectId } }),
    staleTime: STALE_TIME.board,
  });
}

/** The grouping as a participant checks it, with their own remarks (EL24). */
export function groupCheckQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: [...elementKeys.groups(projectId), "check"] as const,
    queryFn: () => groupCheckFn({ data: { projectId } }),
    staleTime: STALE_TIME.board,
  });
}
