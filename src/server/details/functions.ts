// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Detail server functions (DT1, DT2): session middleware, then Zod validation, then the query,
// which checks the project role and the phase itself.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/index.ts";
import { requireSession } from "../middleware.ts";
import { projectInput } from "../projects/schemas.ts";
import {
  addressObjection,
  answerDetail,
  detailBoard,
  proposeDetail,
  settleDetail,
} from "./queries.ts";
import {
  addressObjectionInput,
  answerDetailInput,
  proposeCodesInput,
  proposeDetailInput,
  proposeTreeInput,
  reviewCodesInput,
  settleDetailInput,
  skipReviewInput,
} from "./schemas.ts";
import { proposeCodes, reviewCodes, skipReview } from "./terminology.ts";
import { proposeTree, treeBoard } from "./tree.ts";

export const detailBoardFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => detailBoard(getDb(), context.userId, data.projectId));

export const proposeDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(proposeDetailInput)
  .handler(({ data, context }) => proposeDetail(getDb(), context.userId, data));

export const answerDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(answerDetailInput)
  .handler(({ data, context }) => answerDetail(getDb(), context.userId, data));

export const addressObjectionFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(addressObjectionInput)
  .handler(({ data, context }) => addressObjection(getDb(), context.userId, data));

export const settleDetailFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(settleDetailInput)
  .handler(({ data, context }) => settleDetail(getDb(), context.userId, data));

export const proposeCodesFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(proposeCodesInput)
  .handler(({ data, context }) => proposeCodes(getDb(), context.userId, data));

export const reviewCodesFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(reviewCodesInput)
  .handler(({ data, context }) => reviewCodes(getDb(), context.userId, data));

export const treeBoardFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => treeBoard(getDb(), context.userId, data.projectId));

export const proposeTreeFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(proposeTreeInput)
  .handler(({ data, context }) => proposeTree(getDb(), context.userId, data));

export const skipReviewFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(skipReviewInput)
  .handler(({ data, context }) => skipReview(getDb(), context.userId, data));
