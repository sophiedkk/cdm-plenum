// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the CKM server functions (EL4, EL7), checked before any handler runs.
import { z } from "zod";
import { idSchema } from "../projects/schemas.ts";
import { CID_PATTERN } from "./client.ts";

/** The most search rows one search asks CKM for. */
export const CKM_SEARCH_SIZE_MAX = 50;

const cid = z.string().regex(CID_PATTERN);
// CKM revisions look like `2.0.17` or `0.0.1-alpha`.
const revision = z.string().regex(/^[0-9A-Za-z.+-]{1,40}$/);
// An ADL 1.4 path of attribute names and at-codes, such as `/data[at0001]/items[at0004]`.
const archetypePath = z
  .string()
  .max(1000)
  .regex(/^(\/[a-z_]+(\[at[0-9]+(\.[0-9]+)*\])?)+$/);
const elementId = z.uuid();

export const searchCkmInput = z.object({
  projectId: idSchema,
  text: z.string().trim().min(1).max(200),
  size: z.number().int().min(1).max(CKM_SEARCH_SIZE_MAX).default(20),
});
export type SearchCkmInput = z.infer<typeof searchCkmInput>;

export const archetypeInput = z.object({ projectId: idSchema, cid });
export type ArchetypeInput = z.infer<typeof archetypeInput>;

/** `revision` is the one the facilitator saw; a newer one on CKM refuses the link. */
export const linkElementInput = z.object({
  projectId: idSchema,
  elementId,
  cid,
  revision,
  path: archetypePath,
});
export type LinkElementInput = z.infer<typeof linkElementInput>;

export const importArchetypeInput = z.object({ projectId: idSchema, cid, revision });
export type ImportArchetypeInput = z.infer<typeof importArchetypeInput>;
