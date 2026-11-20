// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the administration server functions, checked before any handler runs. The
// administration page imports this file, so it imports no server module.
import { z } from "zod";
import { idSchema } from "../projects/schemas.ts";
import type { AppRole } from "./app-roles.ts";

/** The longest e-mail address the app accepts, as `inviteInput` does. */
export const EMAIL_MAX = 254;

/** The application roles, as `APP_ROLE_KEYS` of migration 0003; a test checks they match. */
export const APP_ROLE_INPUTS = [
  "administrator",
  "facilitator",
] as const satisfies readonly AppRole[];

/** The activity log entries the administration page shows per page. */
export const ACTIVITY_PAGE_SIZE = 25;

export const appRoleInput = z.object({
  email: z.email().max(EMAIL_MAX),
  role: z.enum(APP_ROLE_INPUTS),
});
export type AppRoleInput = z.infer<typeof appRoleInput>;

export const accountInput = z.object({ userId: idSchema });
export type AccountInput = z.infer<typeof accountInput>;

/** An action code as the activity log stores it, such as `group_created`, and a page from 1. */
export const activityInput = z.object({
  action: z
    .string()
    .regex(/^[a-z][a-z0-9_:]{0,63}$/)
    .optional(),
  page: z.int().min(1).max(100_000).optional(),
});
export type ActivityInput = z.infer<typeof activityInput>;
