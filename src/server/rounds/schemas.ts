// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the round server functions, checked before any handler runs. The rule's own
// consistency (bands inside the scale, agreement above half) is `ruleError` in the query.
import { z } from "zod";
import { CHANGE_CLASSES, EXPERT_TYPES } from "@/lib/panel";
import { idSchema } from "../projects/schemas.ts";

/** The longest reason a participant gives with a rating, and a facilitator for a small panel. */
export const RATING_REASON_MAX = 2000;
export const BELOW_MINIMUM_REASON_MAX = 500;

/** The scores a scale may use; the database stores them as smallint. */
const score = z.int().min(0).max(100);
const percentage = z
  .number()
  .min(0)
  .max(100)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-9, {
    message: "at most two decimals",
  });

export const ruleInput = z
  .object({
    scaleMin: score,
    scaleMax: score,
    bottomBandMax: score,
    topBandMin: score,
    agreementPct: percentage,
    oppositionPct: percentage,
  })
  .partial();
export type RuleInput = z.infer<typeof ruleInput>;

const instant = z.iso.datetime({ offset: true }).transform((value) => new Date(value));

export const changeClassInput = z.object({
  projectId: idSchema,
  changeClass: z.enum(CHANGE_CLASSES),
});
export type ChangeClassInput = z.infer<typeof changeClassInput>;

/** A null minimum drops the project's own count, so the class default applies again. */
export const panelMinimumInput = z.object({
  projectId: idSchema,
  expertType: z.enum(EXPERT_TYPES),
  minimum: z.int().min(0).max(1000).nullable(),
});
export type PanelMinimumInput = z.infer<typeof panelMinimumInput>;

const elementIds = z.array(z.uuid()).max(1000);

export const createRoundInput = z.object({
  projectId: idSchema,
  /** Left out: every element without consensus in the previous round, or every element. */
  elementIds: elementIds.optional(),
  rule: ruleInput.optional(),
  facilitatorSeesRaters: z.boolean().optional(),
  closesAt: instant,
});
export type CreateRoundInput = z.output<typeof createRoundInput>;

export const updateRoundInput = z.object({
  projectId: idSchema,
  roundId: z.uuid(),
  elementIds: elementIds.optional(),
  rule: ruleInput.optional(),
  facilitatorSeesRaters: z.boolean().optional(),
  closesAt: instant.optional(),
});
export type UpdateRoundInput = z.output<typeof updateRoundInput>;

export const roundInput = z.object({ projectId: idSchema, roundId: z.uuid() });
export type RoundInput = z.infer<typeof roundInput>;

export const openRoundInput = roundInput.extend({
  belowMinimumReason: z.string().max(BELOW_MINIMUM_REASON_MAX).optional(),
});
export type OpenRoundInput = z.infer<typeof openRoundInput>;

/** A null score is "unable to rate" (DE3). */
export const saveRatingInput = roundInput.extend({
  elementId: z.uuid(),
  score: score.nullable(),
  reason: z.string().max(RATING_REASON_MAX).optional(),
});
export type SaveRatingInput = z.infer<typeof saveRatingInput>;

export const ratingInput = roundInput.extend({ elementId: z.uuid() });
export type RatingInput = z.infer<typeof ratingInput>;
