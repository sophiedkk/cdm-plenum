// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the source model server functions (EL12, EL20), checked before any handler runs.
// The title and link limits match the source_model checks of migration 0012.
import { z } from "zod";
import { CID_PATTERN } from "../ckm/client.ts";
import { canonicalUrl, packageName, packageVersion } from "../fhir/schemas.ts";
import { idSchema } from "../projects/schemas.ts";

export const SOURCE_TITLE_MAX = 200;
export const SOURCE_LINK_MAX = 2000;

const sourceModelId = z.uuid();
const title = z.string().trim().min(1).max(SOURCE_TITLE_MAX);
const link = z
  .url({ protocol: /^https?$/ })
  .max(SOURCE_LINK_MAX)
  .nullable()
  .default(null);

export const projectInput = z.object({ projectId: idSchema });
export type ProjectInput = z.infer<typeof projectInput>;

export const addFhirSourceInput = z.object({
  projectId: idSchema,
  packageName,
  version: packageVersion,
  url: canonicalUrl,
});
export type AddFhirSourceInput = z.infer<typeof addFhirSourceInput>;

export const addCkmSourceInput = z.object({
  projectId: idSchema,
  cid: z.string().regex(CID_PATTERN),
});
export type AddCkmSourceInput = z.infer<typeof addCkmSourceInput>;

/** A form, a local data set or a guideline (EL12), or a participant's suggestion. */
export const otherSourceInput = z.object({ projectId: idSchema, title, link });
export type OtherSourceInput = z.infer<typeof otherSourceInput>;

export const sourceModelInput = z.object({ projectId: idSchema, sourceModelId });
export type SourceModelInput = z.infer<typeof sourceModelInput>;

/** Marks a source model as the base model, or unmarks it (EL25). */
export const baseModelInput = z.object({ projectId: idSchema, sourceModelId, base: z.boolean() });
export type BaseModelInput = z.infer<typeof baseModelInput>;

/** The most rows "Put on the list" takes at once; a model has a few hundred elements at most. */
export const PUT_ON_LIST_MAX = 1000;

/** The rows of the coverage table to put on the list, each by its first source element (EL20). */
export const putOnListInput = z.object({
  projectId: idSchema,
  rowIds: z.array(sourceModelId).min(1).max(PUT_ON_LIST_MAX),
});
export type PutOnListInput = z.infer<typeof putOnListInput>;

/** "Not the same" on one row of the coverage table, named by its id (EL20). */
export const unmatchRowInput = z.object({ projectId: idSchema, rowId: z.uuid() });
export type UnmatchRowInput = z.infer<typeof unmatchRowInput>;
