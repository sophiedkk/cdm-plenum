// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the element server functions, checked before any handler runs.
import { z } from "zod";
import { ELEMENT_PROMPTS } from "@/lib/brainstorm";
import { cardinalityError } from "@/lib/cardinality";
import { DATA_TYPES, type DataTypeKey } from "@/lib/data-types";
import { CSV_MAX_BYTES } from "@/lib/element-csv";
import { ELEMENT_GROUP_NAME_MAX, GROUP_MISSING_MAX } from "@/lib/element-groups";
import {
  ELEMENT_COMMENT_MAX,
  ELEMENT_DESCRIPTION_MAX,
  ELEMENT_NAME_MAX,
  ELEMENT_SOURCE_LABEL_MAX,
  ELEMENT_VALUE_TEXT_MAX,
  ELEMENT_VALUES_MAX,
  isReferenceUrl,
  MERGE_SOURCES_MAX,
  REFERENCE_TITLE_MAX,
  REFERENCE_URL_MAX,
} from "@/lib/elements";
import { FIRST_LOOK_ANSWERS } from "@/lib/first-look";
import { idSchema } from "../projects/schemas.ts";

const DATA_TYPE_KEYS = DATA_TYPES.map((type) => type.key) as [DataTypeKey, ...DataTypeKey[]];

/** A key of the data type list, or null for "not decided" (EL1, ADR 0009). */
export const dataTypeSchema = z.enum(DATA_TYPE_KEYS).nullable().default(null);

/** A minimum of 0 or 1 and a maximum of a positive number or null for many (EL1). */
export const cardinalitySchema = z
  .object({ min: z.number(), max: z.number().nullable() })
  .superRefine((value, ctx) => {
    const error = cardinalityError(value.min, value.max);
    if (error !== null) ctx.addIssue({ code: "custom", message: error });
  })
  .transform((value) => ({ min: value.min as 0 | 1, max: value.max }))
  .nullable()
  .default(null);

/**
 * The model a reference element names (EL26), or null for a data element. The link is optional
 * and http or https only, so the board never renders a script link.
 */
export const referenceSchema = z
  .object({
    title: z.string().trim().min(1).max(REFERENCE_TITLE_MAX),
    url: z
      .string()
      .trim()
      .max(REFERENCE_URL_MAX)
      .refine(isReferenceUrl, "not an http or https link")
      .nullable()
      .default(null),
  })
  .nullable()
  .default(null);

const elementFields = {
  name: z.string().trim().min(1).max(ELEMENT_NAME_MAX),
  description: z.string().trim().max(ELEMENT_DESCRIPTION_MAX).default(""),
  dataType: dataTypeSchema,
  cardinality: cardinalitySchema,
  reference: referenceSchema,
};

export const addElementInput = z.object({
  projectId: idSchema,
  ...elementFields,
  /** Where the idea came from, in the participant's words; optional (EL1). */
  source: z.string().trim().max(ELEMENT_SOURCE_LABEL_MAX).default(""),
  /** The brainstorm question the element answers (EL14); null from the board's own form. */
  prompt: z.enum(ELEMENT_PROMPTS).nullable().default(null),
});
export type AddElementInput = z.infer<typeof addElementInput>;

export const updateElementInput = z.object({
  projectId: idSchema,
  elementId: idSchema,
  ...elementFields,
});
export type UpdateElementInput = z.infer<typeof updateElementInput>;

export const elementInput = z.object({ projectId: idSchema, elementId: idSchema });
export type ElementInput = z.infer<typeof elementInput>;

export const mergeElementsInput = z
  .object({
    projectId: idSchema,
    /** The element that stays on the board. */
    intoId: idSchema,
    /** The duplicates that merge into it. */
    fromIds: z.array(idSchema).min(1).max(MERGE_SOURCES_MAX),
  })
  .refine(
    (input) => new Set(input.fromIds).size === input.fromIds.length,
    "an element is named twice",
  )
  .refine((input) => !input.fromIds.includes(input.intoId), "an element merges into itself");
export type MergeElementsInput = z.infer<typeof mergeElementsInput>;

export const addElementCommentInput = z.object({
  projectId: idSchema,
  elementId: idSchema,
  body: z.string().trim().min(1).max(ELEMENT_COMMENT_MAX),
});
export type AddElementCommentInput = z.infer<typeof addElementCommentInput>;

export const elementValueSchema = z.object({
  text: z.string().trim().min(1).max(ELEMENT_VALUE_TEXT_MAX),
  value: z.number().finite().nullable().default(null),
});

/** The whole ordered value list; an empty list clears it (EL9). */
export const setElementValuesInput = z.object({
  projectId: idSchema,
  elementId: idSchema,
  values: z.array(elementValueSchema).max(ELEMENT_VALUES_MAX),
});
export type SetElementValuesInput = z.infer<typeof setElementValuesInput>;

export const csvImportInput = z.object({
  projectId: idSchema,
  /** The file's name, stored as the source label of every imported element (EL3). */
  fileName: z.string().trim().min(1).max(ELEMENT_SOURCE_LABEL_MAX),
  /** The file read as UTF-8 text; the parser checks the size in bytes. */
  content: z.string().max(CSV_MAX_BYTES),
});
export type CsvImportInput = z.infer<typeof csvImportInput>;

/** The private-first brainstorm on or off (EL13). */
export const privateBrainstormInput = z.object({ projectId: idSchema, enabled: z.boolean() });
export type PrivateBrainstormInput = z.infer<typeof privateBrainstormInput>;

/** "I support this" on or off for the member's own mark (EL16). */
export const setSupportInput = z.object({
  projectId: idSchema,
  elementId: idSchema,
  supported: z.boolean(),
});
export type SetSupportInput = z.infer<typeof setSupportInput>;

/**
 * The member's mark that `elementId` is the same as `sameAsId` (EL16). An element the same as
 * itself is refused by the query (`same_as_itself`), so the screen can show why.
 */
export const sameAsInput = z.object({
  projectId: idSchema,
  elementId: idSchema,
  sameAsId: idSchema,
});
export type SameAsInput = z.infer<typeof sameAsInput>;

/** The member's answer to one element of the first look (EL22). */
export const firstLookAnswerInput = z.object({
  projectId: idSchema,
  elementId: idSchema,
  answer: z.enum(FIRST_LOOK_ANSWERS),
});
export type FirstLookAnswerInput = z.infer<typeof firstLookAnswerInput>;

const elementGroupName = z.string().trim().min(1).max(ELEMENT_GROUP_NAME_MAX);

/** Moves an element to a group, or with a null group to "Not grouped yet" (EL18). */
export const moveElementInput = z.object({
  projectId: idSchema,
  elementId: idSchema,
  groupId: idSchema.nullable(),
});
export type MoveElementInput = z.infer<typeof moveElementInput>;

export const renameElementGroupInput = z.object({
  projectId: idSchema,
  groupId: idSchema,
  name: elementGroupName,
});
export type RenameElementGroupInput = z.infer<typeof renameElementGroupInput>;

export const addElementGroupInput = z.object({ projectId: idSchema, name: elementGroupName });
export type AddElementGroupInput = z.infer<typeof addElementGroupInput>;

/** "Belongs elsewhere" on or off for the member's own mark (EL24). */
export const elsewhereInput = z.object({
  projectId: idSchema,
  elementId: idSchema,
  elsewhere: z.boolean(),
});
export type ElsewhereInput = z.infer<typeof elsewhereInput>;

/** What a group misses, in the member's words (EL24). */
export const addGroupMissingInput = z.object({
  projectId: idSchema,
  groupId: idSchema,
  body: z.string().trim().min(1).max(GROUP_MISSING_MAX),
});
export type AddGroupMissingInput = z.infer<typeof addGroupMissingInput>;
