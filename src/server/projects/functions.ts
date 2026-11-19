// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Project server functions: session middleware, then Zod validation, then the query, which
// checks the application or project role itself.
import { createServerFn } from "@tanstack/react-start";
import { getLocale } from "@/i18n/runtime";
import { getDb } from "../db/index.ts";
import { requireSession } from "../middleware.ts";
import {
  createGroup,
  createProject,
  getProject,
  leaveProject,
  listGroupMembers,
  listGroups,
  listProjects,
  removeGroup,
  renameGroup,
} from "./queries.ts";
import {
  createGroupInput,
  createProjectInput,
  groupInput,
  projectInput,
  renameGroupInput,
} from "./schemas.ts";

export const createProjectFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(createProjectInput)
  .handler(({ data, context }) => createProject(getDb(), context.userId, data, getLocale()));

export const listProjectsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .handler(({ context }) => listProjects(getDb(), context.userId));

export const getProjectFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => getProject(getDb(), context.userId, data.projectId));

export const listGroupsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => listGroups(getDb(), context.userId, data.projectId));

export const listGroupMembersFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => listGroupMembers(getDb(), context.userId, data.projectId));

export const leaveProjectFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => leaveProject(getDb(), context.userId, data.projectId));

export const createGroupFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(createGroupInput)
  .handler(({ data, context }) => createGroup(getDb(), context.userId, data));

export const renameGroupFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(renameGroupInput)
  .handler(({ data, context }) => renameGroup(getDb(), context.userId, data));

export const removeGroupFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(groupInput)
  .handler(({ data, context }) => removeGroup(getDb(), context.userId, data));
