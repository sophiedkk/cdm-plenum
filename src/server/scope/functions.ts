// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Scope server functions: session middleware, then Zod validation, then the query, which
// checks the project role itself.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/index.ts";
import { requireSession } from "../middleware.ts";
import { projectInput } from "../projects/schemas.ts";
import {
  addScopeComment,
  addScopeSource,
  getScope,
  listScopeComments,
  listScopeCommentsWithAuthors,
  removeScopeSource,
  reorderScopeSources,
  restoreScopeSource,
  setModelType,
  updateScope,
} from "./queries.ts";
import {
  addScopeCommentInput,
  addScopeSourceInput,
  reorderScopeSourcesInput,
  restoreScopeSourceInput,
  scopeSourceInput,
  setModelTypeInput,
  updateScopeInput,
} from "./schemas.ts";

export const getScopeFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => getScope(getDb(), context.userId, data.projectId));

export const updateScopeFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(updateScopeInput)
  .handler(({ data, context }) => updateScope(getDb(), context.userId, data));

export const setModelTypeFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(setModelTypeInput)
  .handler(({ data, context }) => setModelType(getDb(), context.userId, data));

export const addScopeSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(addScopeSourceInput)
  .handler(({ data, context }) => addScopeSource(getDb(), context.userId, data));

export const reorderScopeSourcesFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(reorderScopeSourcesInput)
  .handler(({ data, context }) => reorderScopeSources(getDb(), context.userId, data));

export const removeScopeSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(scopeSourceInput)
  .handler(({ data, context }) => removeScopeSource(getDb(), context.userId, data));

export const restoreScopeSourceFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(restoreScopeSourceInput)
  .handler(({ data, context }) => restoreScopeSource(getDb(), context.userId, data));

export const addScopeCommentFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(addScopeCommentInput)
  .handler(({ data, context }) => addScopeComment(getDb(), context.userId, data));

export const listScopeCommentsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => listScopeComments(getDb(), context.userId, data.projectId));

export const listScopeCommentsWithAuthorsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) =>
    listScopeCommentsWithAuthors(getDb(), context.userId, data.projectId),
  );
