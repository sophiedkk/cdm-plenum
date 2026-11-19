// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the round server functions, checked before any handler runs. The rule's own
// consistency (bands inside the scale, agreement above half) is `ruleError` in the query.
import { z } from "zod";
import { CHANGE_CLASSES, type EXPERT_TYPES } from "@/lib/panel";
import { idSchema } from "../projects/schemas.ts";

/** The longest reason a participant gives with a rating, and a facilitator for a small panel. */
export const RATING_REASON_MAX = 2000;
export const BELOW_MINIMUM_REASON_MAX = 500;
/** The longest reason for the project's own minimum panel (DE13); migration 0006 agrees. */
export const PANEL_MINIMUM_REASON_MAX = 500;

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

const minimumCount = z.int().min(0).max(1000).nullable();

/**
 * The project's own minimum per expert type (DE13). A null count keeps the class default; the
 * reason is required while any count is set, which the query checks.
 */
export const panelMinimumsInput = z.object({
  projectId: idSchema,
  minimums: z.object({
    clinical: minimumCount,
    terminology: minimumCount,
    architecture: minimumCount,
  } satisfies Record<(typeof EXPERT_TYPES)[number], typeof minimumCount>),
  reason: z.string().max(PANEL_MINIMUM_REASON_MAX).optional(),
});
export type PanelMinimumsInput = z.infer<typeof panelMinimumsInput>;

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
