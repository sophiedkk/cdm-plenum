// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the detail server functions (DT1, DT2), checked before any handler runs.
import { z } from "zod";
import {
  BINDING_STRENGTHS,
  CODE_DISPLAY_MAX,
  CODE_MAX,
  CODE_SYSTEM_MAX,
  DETAIL_ANSWERS,
  DETAIL_TEXT_MAX,
  VALUE_SET_URL_MAX,
} from "@/lib/details";
import { ELEMENT_GROUP_NAME_MAX } from "@/lib/element-groups";
import { ELEMENT_VALUES_MAX, isReferenceUrl } from "@/lib/elements";
import {
  SUB_BLOCK_TITLE_MAX,
  SUB_BLOCK_URL_MAX,
  TREE_ELEMENTS_MAX,
  TREE_GROUPS_MAX,
} from "@/lib/model-tree";
import {
  cardinalitySchema,
  dataTypeSchema,
  elementValueSchema,
  unitsSchema,
} from "../elements/schemas.ts";
import { idSchema } from "../projects/schemas.ts";

const text = z.string().trim().min(1).max(DETAIL_TEXT_MAX);

/**
 * A structure proposal for an element (DT1). `version` is the version the proposer saw: 0 for a
 * first proposal, so two proposers never overwrite each other unseen.
 */
export const proposeDetailInput = z.object({
  projectId: idSchema,
  elementId: idSchema,
  version: z.number().int().min(0),
  dataType: dataTypeSchema,
  cardinality: cardinalitySchema,
  values: z.array(elementValueSchema).max(ELEMENT_VALUES_MAX),
  units: unitsSchema,
});
export type ProposeDetailInput = z.infer<typeof proposeDetailInput>;

/** An answer to one version of a proposal (DT2): agree, or an objection with a reason. */
export const answerDetailInput = z
  .object({
    projectId: idSchema,
    proposalId: idSchema,
    version: z.number().int().min(1),
    answer: z.enum(DETAIL_ANSWERS),
    reason: text.nullable().default(null),
  })
  .refine((input) => (input.answer === "objection") === (input.reason !== null), {
    path: ["reason"],
  });
export type AnswerDetailInput = z.infer<typeof answerDetailInput>;

/** The facilitator's note that an objection is addressed (DT2). */
export const addressObjectionInput = z.object({
  projectId: idSchema,
  answerId: idSchema,
  note: text,
});
export type AddressObjectionInput = z.infer<typeof addressObjectionInput>;

/** Settles the version of a proposal the facilitator saw (DT2). */
export const settleDetailInput = z.object({
  projectId: idSchema,
  proposalId: idSchema,
  version: z.number().int().min(1),
});
export type SettleDetailInput = z.infer<typeof settleDetailInput>;

/** A code in a code system (DT5): the system URI, the code and an optional display text. */
export const detailCodeSchema = z.object({
  system: z.string().trim().min(1).max(CODE_SYSTEM_MAX),
  code: z.string().trim().min(1).max(CODE_MAX),
  display: z.string().trim().min(1).max(CODE_DISPLAY_MAX).nullable().default(null),
});

/**
 * A code proposal for an element whose structure is settled (DT4, DT5): the element code, the
 * binding, an optional value set URL and one entry per value of the settled value list.
 */
export const proposeCodesInput = z.object({
  projectId: idSchema,
  elementId: idSchema,
  version: z.number().int().min(0),
  code: detailCodeSchema.nullable(),
  bindingStrength: z.enum(BINDING_STRENGTHS).nullable(),
  valueSetUrl: z.string().trim().url().max(VALUE_SET_URL_MAX).nullable(),
  valueCodes: z.array(detailCodeSchema.nullable()).max(ELEMENT_VALUES_MAX),
});
export type ProposeCodesInput = z.infer<typeof proposeCodesInput>;

/** A second terminologist's review of one version (DT4): approve, or return with a note. */
export const reviewCodesInput = z
  .object({
    projectId: idSchema,
    proposalId: idSchema,
    version: z.number().int().min(1),
    decision: z.enum(["approve", "return"]),
    note: text.nullable().default(null),
  })
  .refine((input) => input.decision === "approve" || input.note !== null, { path: ["note"] });
export type ReviewCodesInput = z.infer<typeof reviewCodesInput>;

/** The facilitator skips the review when no other terminologist can do it, with a reason (DT4). */
export const skipReviewInput = z.object({
  projectId: idSchema,
  proposalId: idSchema,
  version: z.number().int().min(1),
  reason: text,
});
export type SkipReviewInput = z.infer<typeof skipReviewInput>;

/** The existing sub-block a group is linked to (DT6): a title and an optional http(s) link. */
export const subBlockLinkSchema = z.object({
  title: z.string().trim().min(1).max(SUB_BLOCK_TITLE_MAX),
  url: z
    .string()
    .trim()
    .max(SUB_BLOCK_URL_MAX)
    .refine(isReferenceUrl, "not an http or https link")
    .nullable()
    .default(null),
});

/**
 * A group as the tree proposal places it (DT6). `name` names a group the proposal adds, under a
 * new random id; the server ignores it for a group the project has. Only a sub-block takes a link.
 */
export const treeGroupInput = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(ELEMENT_GROUP_NAME_MAX).nullable().default(null),
    parentId: z.uuid().nullable(),
    cardinality: cardinalitySchema,
    subBlock: z.boolean(),
    subBlockLink: subBlockLinkSchema.nullable().default(null),
  })
  .refine((group) => group.subBlock || group.subBlockLink === null, { path: ["subBlockLink"] });

/** An element in the model as the tree proposal places and marks it (DT6). */
export const treeElementInput = z.object({
  id: z.uuid(),
  groupId: z.uuid().nullable(),
  registration: z.boolean(),
});

const unique = (ids: readonly string[]) => new Set(ids).size === ids.length;

/**
 * The tree proposal of the project (DT6): the groups in depth-first order and the elements.
 * `version` is the version the proposer saw, 0 for a first proposal.
 */
export const proposeTreeInput = z
  .object({
    projectId: idSchema,
    version: z.number().int().min(0),
    groups: z.array(treeGroupInput).max(TREE_GROUPS_MAX),
    elements: z.array(treeElementInput).max(TREE_ELEMENTS_MAX),
  })
  .refine((input) => unique(input.groups.map((group) => group.id)), { path: ["groups"] })
  .refine((input) => unique(input.elements.map((element) => element.id)), {
    path: ["elements"],
  });
export type ProposeTreeInput = z.infer<typeof proposeTreeInput>;
