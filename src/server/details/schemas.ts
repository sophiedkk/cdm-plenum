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
import { ELEMENT_VALUES_MAX } from "@/lib/elements";
import { cardinalitySchema, dataTypeSchema, elementValueSchema } from "../elements/schemas.ts";
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
