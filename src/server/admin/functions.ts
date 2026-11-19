// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Administration server functions: session middleware, then Zod validation, then the query,
// which checks the administrator right itself.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/index.ts";
import { requireSession } from "../middleware.ts";
import {
  deactivateAccount,
  grantRole,
  listAccounts,
  listActivity,
  listAppRoles,
  reactivateAccount,
  revokeRole,
} from "./queries.ts";
import { accountInput, activityInput, appRoleInput } from "./schemas.ts";

export const listAppRolesFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(({ context }) => listAppRoles(getDb(), context.userId));

export const grantRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(appRoleInput)
  .handler(({ data, context }) => grantRole(getDb(), context.userId, data));

export const revokeRoleFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(appRoleInput)
  .handler(({ data, context }) => revokeRole(getDb(), context.userId, data));

export const listAccountsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(({ context }) => listAccounts(getDb(), context.userId));

export const deactivateAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(accountInput)
  .handler(({ data, context }) => deactivateAccount(getDb(), context.userId, data, new Date()));

export const reactivateAccountFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(accountInput)
  .handler(({ data, context }) => reactivateAccount(getDb(), context.userId, data));

export const listActivityFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(activityInput)
  .handler(({ data, context }) => listActivity(getDb(), context.userId, data));
