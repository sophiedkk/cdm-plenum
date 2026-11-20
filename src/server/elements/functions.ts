// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Element server functions: session middleware, then Zod validation, then the query, which
// checks the project role itself. Only the `...WithAuthors` functions return authors, and they
// refuse anyone but the facilitator (EL2, EL6, ADR 0005).
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/index.ts";
import { requireSession } from "../middleware.ts";
import { projectInput } from "../projects/schemas.ts";
import { brainstormStatus, revealBoard, setPrivateBrainstorm } from "./brainstorm.ts";
import { importCsv, previewCsvImport } from "./import.ts";
import {
  addElement,
  addElementComment,
  listElementComments,
  listElementCommentsWithAuthors,
  listElements,
  listElementsWithAuthors,
  listOwnElements,
  mergeElements,
  setElementValues,
  updateElement,
} from "./queries.ts";
import {
  addElementCommentInput,
  addElementInput,
  csvImportInput,
  elementInput,
  mergeElementsInput,
  privateBrainstormInput,
  setElementValuesInput,
  updateElementInput,
} from "./schemas.ts";

export const listElementsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => listElements(getDb(), context.userId, data.projectId));

export const listElementsWithAuthorsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => listElementsWithAuthors(getDb(), context.userId, data.projectId));

export const addElementFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(addElementInput)
  .handler(({ data, context }) => addElement(getDb(), context.userId, data));

export const updateElementFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(updateElementInput)
  .handler(({ data, context }) => updateElement(getDb(), context.userId, data));

export const mergeElementsFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(mergeElementsInput)
  .handler(({ data, context }) => mergeElements(getDb(), context.userId, data));

export const setElementValuesFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(setElementValuesInput)
  .handler(({ data, context }) => setElementValues(getDb(), context.userId, data));

export const addElementCommentFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(addElementCommentInput)
  .handler(({ data, context }) => addElementComment(getDb(), context.userId, data));

export const listElementCommentsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(elementInput)
  .handler(({ data, context }) => listElementComments(getDb(), context.userId, data));

export const listElementCommentsWithAuthorsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(elementInput)
  .handler(({ data, context }) => listElementCommentsWithAuthors(getDb(), context.userId, data));

// POST for both: the file can be up to 1 MiB, too large for a query string.
export const previewCsvImportFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(csvImportInput)
  .handler(({ data, context }) => previewCsvImport(getDb(), context.userId, data));

export const importCsvFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(csvImportInput)
  .handler(({ data, context }) => importCsv(getDb(), context.userId, data));

export const listOwnElementsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => listOwnElements(getDb(), context.userId, data.projectId));

export const brainstormStatusFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => brainstormStatus(getDb(), context.userId, data.projectId));

export const revealBoardFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => revealBoard(getDb(), context.userId, data.projectId));

export const setPrivateBrainstormFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(privateBrainstormInput)
  .handler(({ data, context }) => setPrivateBrainstorm(getDb(), context.userId, data));
