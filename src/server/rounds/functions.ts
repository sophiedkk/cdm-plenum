// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Round server functions: session middleware, then Zod validation, then the query, which checks
// the project role itself.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/index.ts";
import { requireSession } from "../middleware.ts";
import { projectInput } from "../projects/schemas.ts";
import {
  closeRound,
  createRound,
  getRound,
  listRounds,
  openRound,
  panelStatus,
  setChangeClass,
  setPanelMinimums,
  updateRound,
} from "./queries.ts";
import { clearRating, myRatings, ratingsByParticipant, saveRating } from "./ratings.ts";
import { responseRate, roundResults } from "./results.ts";
import {
  changeClassInput,
  createRoundInput,
  openRoundInput,
  panelMinimumsInput,
  ratingInput,
  roundInput,
  saveRatingInput,
  updateRoundInput,
} from "./schemas.ts";

const now = () => ({ now: new Date() });

export const setChangeClassFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(changeClassInput)
  .handler(({ data, context }) => setChangeClass(getDb(), context.userId, data));

export const setPanelMinimumsFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(panelMinimumsInput)
  .handler(({ data, context }) => setPanelMinimums(getDb(), context.userId, data));

export const panelStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => panelStatus(getDb(), context.userId, data.projectId));

export const createRoundFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(createRoundInput)
  .handler(({ data, context }) => createRound(getDb(), context.userId, data, now()));

export const updateRoundFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(updateRoundInput)
  .handler(({ data, context }) => updateRound(getDb(), context.userId, data, now()));

export const openRoundFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(openRoundInput)
  .handler(({ data, context }) => openRound(getDb(), context.userId, data, now()));

export const closeRoundFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => closeRound(getDb(), context.userId, data, now()));

export const listRoundsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => listRounds(getDb(), context.userId, data.projectId, now()));

export const getRoundFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => getRound(getDb(), context.userId, data, now()));

export const saveRatingFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(saveRatingInput)
  .handler(({ data, context }) => saveRating(getDb(), context.userId, data));

export const clearRatingFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(ratingInput)
  .handler(({ data, context }) => clearRating(getDb(), context.userId, data));

export const myRatingsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => myRatings(getDb(), context.userId, data, now()));

export const roundResultsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => roundResults(getDb(), context.userId, data, now()));

export const responseRateFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => responseRate(getDb(), context.userId, data, now()));

export const ratingsByParticipantFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(roundInput)
  .handler(({ data, context }) => ratingsByParticipant(getDb(), context.userId, data));
