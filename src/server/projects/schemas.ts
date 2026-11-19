// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the project server functions, checked before any handler runs.
import { z } from "zod";
import { EXPERT_TYPES, GROUP_NAME_MAX, PROJECT_NAME_MAX } from "@/lib/project-roles";

/** better-auth and cdm-plenum ids: UUIDs or 32 URL-safe characters. */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const name = (max: number) => z.string().trim().min(1).max(max);

export const createProjectInput = z.object({ name: name(PROJECT_NAME_MAX) });
export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const projectInput = z.object({ projectId: idSchema });

export const createGroupInput = z.object({
  projectId: idSchema,
  name: name(GROUP_NAME_MAX),
  expertType: z.enum(EXPERT_TYPES),
});
export type CreateGroupInput = z.infer<typeof createGroupInput>;

export const renameGroupInput = z.object({
  projectId: idSchema,
  groupId: idSchema,
  name: name(GROUP_NAME_MAX),
});
export type RenameGroupInput = z.infer<typeof renameGroupInput>;

export const groupInput = z.object({ projectId: idSchema, groupId: idSchema });
export type GroupInput = z.infer<typeof groupInput>;

export const groupNamesVisibleInput = z.object({ projectId: idSchema, visible: z.boolean() });
export type GroupNamesVisibleInput = z.infer<typeof groupNamesVisibleInput>;

/** A null group takes the facilitator out of the group they rate in (DE14). */
export const raterGroupInput = z.object({ projectId: idSchema, groupId: idSchema.nullable() });
export type RaterGroupInput = z.infer<typeof raterGroupInput>;
