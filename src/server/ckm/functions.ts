// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// CKM server functions (EL4, EL7): session middleware, then Zod validation, then the query,
// which checks the project role itself before it calls CKM.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/index.ts";
import { requireSession } from "../middleware.ts";
import { getCkmClient } from "./client.ts";
import { linkElement, listArchetypeElements, searchCkm } from "./queries.ts";
import { archetypeInput, linkElementInput, searchCkmInput } from "./schemas.ts";

export const searchCkmFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(searchCkmInput)
  .handler(({ data, context }) => searchCkm(getDb(), getCkmClient(), context.userId, data));

export const listArchetypeElementsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(archetypeInput)
  .handler(({ data, context }) =>
    listArchetypeElements(getDb(), getCkmClient(), context.userId, data),
  );

export const linkElementFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(linkElementInput)
  .handler(({ data, context }) => linkElement(getDb(), getCkmClient(), context.userId, data));
