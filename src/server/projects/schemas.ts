// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the project server functions, checked before any handler runs.
import { z } from "zod";
import { PHASE_DIRECTIONS, PROJECT_PHASES } from "@/lib/project-phases";
import { EXPERT_TYPES, GROUP_NAME_MAX, PROJECT_NAME_MAX } from "@/lib/project-roles";

/** better-auth and cdm-plenum ids: UUIDs or 32 URL-safe characters. */
export const idSchema = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

const name = (max: number) => z.string().trim().min(1).max(max);

export const createProjectInput = z.object({ name: name(PROJECT_NAME_MAX) });
export type CreateProjectInput = z.infer<typeof createProjectInput>;

export const projectInput = z.object({ projectId: idSchema });

/** A CSV export: the project and the separator, a comma unless the caller asks for a semicolon (EX1). */
export const csvExportInput = z.object({
  projectId: idSchema,
  separator: z.enum(["comma", "semicolon"]).default("comma"),
});

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

/**
 * Moves the project one phase on or back (PR4). `from` is the phase the facilitator saw, so a
 * second click or another facilitator's move in between is refused instead of skipping a phase.
 */
export const movePhaseInput = z.object({
  projectId: idSchema,
  from: z.enum(PROJECT_PHASES),
  direction: z.enum(PHASE_DIRECTIONS),
});
export type MovePhaseInput = z.infer<typeof movePhaseInput>;

/** A null group takes the facilitator out of the group they rate in (DE14). */
export const raterGroupInput = z.object({ projectId: idSchema, groupId: idSchema.nullable() });
export type RaterGroupInput = z.infer<typeof raterGroupInput>;

/** A phase whose recap to read (PR13). */
export const phaseRecapInput = z.object({ projectId: idSchema, phase: z.enum(PROJECT_PHASES) });
export type PhaseRecapInput = z.infer<typeof phaseRecapInput>;
