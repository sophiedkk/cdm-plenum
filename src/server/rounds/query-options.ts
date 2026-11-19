// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Query keys and options of the round screens. A mutation invalidates keys from this factory,
// never the whole cache.
import { queryOptions } from "@tanstack/react-query";
import { STALE_TIME } from "@/lib/query-config";
import { listElementsFn } from "../elements/functions.ts";
import {
  getRoundFn,
  listRoundsFn,
  myRatingsFn,
  panelStatusFn,
  ratingsByParticipantFn,
  responseRateFn,
  roundResultsFn,
} from "./functions.ts";

export const roundKeys = {
  all: ["rounds"] as const,
  project: (projectId: string) => [...roundKeys.all, projectId] as const,
  list: (projectId: string) => [...roundKeys.project(projectId), "list"] as const,
  panel: (projectId: string) => [...roundKeys.project(projectId), "panel"] as const,
  elements: (projectId: string) => [...roundKeys.project(projectId), "elements"] as const,
  round: (projectId: string, roundId: string) =>
    [...roundKeys.project(projectId), "round", roundId] as const,
  detail: (projectId: string, roundId: string) =>
    [...roundKeys.round(projectId, roundId), "detail"] as const,
  mine: (projectId: string, roundId: string) =>
    [...roundKeys.round(projectId, roundId), "mine"] as const,
  results: (projectId: string, roundId: string) =>
    [...roundKeys.round(projectId, roundId), "results"] as const,
  responseRate: (projectId: string, roundId: string) =>
    [...roundKeys.round(projectId, roundId), "response-rate"] as const,
  byParticipant: (projectId: string, roundId: string) =>
    [...roundKeys.round(projectId, roundId), "by-participant"] as const,
};

/** The rounds of the project, newest first; a participant gets no drafts. */
export function roundsQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: roundKeys.list(projectId),
    queryFn: () => listRoundsFn({ data: { projectId } }),
    staleTime: STALE_TIME.rounds,
  });
}

/** The panel per expert type next to the minimum (facilitator only, DE11). */
export function panelStatusQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: roundKeys.panel(projectId),
    queryFn: () => panelStatusFn({ data: { projectId } }),
    staleTime: STALE_TIME.rounds,
  });
}

/** The board's elements, for the element choice of a round and the data type on the rating screen. */
export function roundBoardQueryOptions(projectId: string) {
  return queryOptions({
    queryKey: roundKeys.elements(projectId),
    queryFn: () => listElementsFn({ data: { projectId } }),
    staleTime: STALE_TIME.rounds,
  });
}

/** One round with its elements and its opening snapshot. */
export function roundQueryOptions(projectId: string, roundId: string) {
  return queryOptions({
    queryKey: roundKeys.detail(projectId, roundId),
    queryFn: () => getRoundFn({ data: { projectId, roundId } }),
    staleTime: STALE_TIME.rounds,
  });
}

/** The signed-in participant's own ratings, with the previous round next to them (DE7, DE8). */
export function myRatingsQueryOptions(projectId: string, roundId: string) {
  return queryOptions({
    queryKey: roundKeys.mine(projectId, roundId),
    queryFn: () => myRatingsFn({ data: { projectId, roundId } }),
    staleTime: STALE_TIME.rounds,
  });
}

/** The results of a closed round (DE5). */
export function roundResultsQueryOptions(projectId: string, roundId: string) {
  return queryOptions({
    queryKey: roundKeys.results(projectId, roundId),
    queryFn: () => roundResultsFn({ data: { projectId, roundId } }),
    staleTime: STALE_TIME.rounds,
  });
}

/** Invited, started and completed participants per stakeholder group (facilitator, DE6). */
export function responseRateQueryOptions(projectId: string, roundId: string) {
  return queryOptions({
    queryKey: roundKeys.responseRate(projectId, roundId),
    queryFn: () => responseRateFn({ data: { projectId, roundId } }),
    staleTime: STALE_TIME.rounds,
  });
}

/** Who gave which rating, when the round allows it (facilitator, DE4). */
export function ratingsByParticipantQueryOptions(projectId: string, roundId: string) {
  return queryOptions({
    queryKey: roundKeys.byParticipant(projectId, roundId),
    queryFn: () => ratingsByParticipantFn({ data: { projectId, roundId } }),
    staleTime: STALE_TIME.rounds,
  });
}
