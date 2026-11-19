// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the scope server functions, checked before any handler runs.
import { z } from "zod";
import { idSchema } from "../projects/schemas.ts";

/** The longest part of the scope statement, source label and comment the app stores. */
export const SCOPE_TEXT_MAX = 10_000;
export const SCOPE_SOURCE_LABEL_MAX = 300;
export const SCOPE_SOURCE_URL_MAX = 2_000;
export const COMMENT_MAX = 4_000;
/** More sources than this is a reading list, not a scope (no requirement sets it). */
export const SCOPE_SOURCES_MAX = 100;

const text = (max: number) => z.string().trim().max(max);

export const updateScopeInput = z.object({
  projectId: idSchema,
  concept: text(SCOPE_TEXT_MAX),
  useCases: text(SCOPE_TEXT_MAX),
  outOfScope: text(SCOPE_TEXT_MAX),
});
export type UpdateScopeInput = z.infer<typeof updateScopeInput>;

/** An absolute http or https address; anything else could run script in a link. */
export const httpUrl = z
  .string()
  .trim()
  .max(SCOPE_SOURCE_URL_MAX)
  .refine((value) => {
    try {
      const url = new URL(value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }, "not an http or https URL");

export const addScopeSourceInput = z.object({
  projectId: idSchema,
  label: z.string().trim().min(1).max(SCOPE_SOURCE_LABEL_MAX),
  url: httpUrl.nullable().default(null),
});
export type AddScopeSourceInput = z.infer<typeof addScopeSourceInput>;

export const scopeSourceInput = z.object({ projectId: idSchema, sourceId: idSchema });
export type ScopeSourceInput = z.infer<typeof scopeSourceInput>;

export const reorderScopeSourcesInput = z.object({
  projectId: idSchema,
  sourceIds: z.array(idSchema).max(SCOPE_SOURCES_MAX),
});
export type ReorderScopeSourcesInput = z.infer<typeof reorderScopeSourcesInput>;

export const addScopeCommentInput = z.object({
  projectId: idSchema,
  body: z.string().trim().min(1).max(COMMENT_MAX),
});
export type AddScopeCommentInput = z.infer<typeof addScopeCommentInput>;
