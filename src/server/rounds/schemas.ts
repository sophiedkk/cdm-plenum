// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The input of the round server functions, checked before any handler runs. The rule's own
// consistency (bands inside the scale, agreement above half) is `ruleError` in the query.
import { z } from "zod";
import { CONSENT_ANSWERS, CONSENT_TEXT_MAX } from "@/lib/consent";
import { ELEMENT_NAME_MAX } from "@/lib/elements";
import { CHANGE_CLASSES, type EXPERT_TYPES } from "@/lib/panel";
import { idSchema } from "../projects/schemas.ts";

/** The longest reason a participant gives with a rating, and a facilitator for a small panel. */
export const RATING_REASON_MAX = 2000;
export const BELOW_MINIMUM_REASON_MAX = 500;
/** The longest reason for the project's own minimum panel (DE13); migration 0006 agrees. */
export const PANEL_MINIMUM_REASON_MAX = 500;
/** The longest proposal rule, name and description (DE16); migration 0008 agrees. */
export const PROPOSAL_RULE_MAX = 500;
export const PROPOSAL_NAME_MAX = ELEMENT_NAME_MAX;
export const PROPOSAL_DESCRIPTION_MAX = 500;

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

/** The rule for adding proposed elements (DE16); null or blank means none. Round 1 only. */
const proposalRule = z.string().max(PROPOSAL_RULE_MAX).nullable();

export const createRoundInput = z.object({
  projectId: idSchema,
  /** Left out: every element without consensus in the previous round, or every element. */
  elementIds: elementIds.optional(),
  rule: ruleInput.optional(),
  facilitatorSeesRaters: z.boolean().optional(),
  proposalRule: proposalRule.optional(),
  closesAt: instant,
});
export type CreateRoundInput = z.output<typeof createRoundInput>;

export const updateRoundInput = z.object({
  projectId: idSchema,
  roundId: z.uuid(),
  elementIds: elementIds.optional(),
  rule: ruleInput.optional(),
  facilitatorSeesRaters: z.boolean().optional(),
  proposalRule: proposalRule.optional(),
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

/** A member's consent answer to one element of a Team round (DE20); migration 0029 agrees. */
export const saveConsentInput = ratingInput.extend({
  answer: z.enum(CONSENT_ANSWERS),
  reason: z.string().max(CONSENT_TEXT_MAX).optional(),
});
export type SaveConsentInput = z.infer<typeof saveConsentInput>;

export const consentInput = ratingInput;
export type ConsentInput = z.infer<typeof consentInput>;

/** The facilitator settles an element that ended on "To discuss", with a note (DE20). */
export const settleInput = ratingInput.extend({
  outcome: z.enum(["included", "excluded"]),
  note: z.string().max(CONSENT_TEXT_MAX),
});
export type SettleInput = z.infer<typeof settleInput>;

/** A rating of one value of a value round (DT3); a null score is "unable to rate". */
export const saveValueRatingInput = roundInput.extend({
  valueId: z.uuid(),
  score: score.nullable(),
  reason: z.string().max(RATING_REASON_MAX).optional(),
});
export type SaveValueRatingInput = z.infer<typeof saveValueRatingInput>;

export const valueRatingInput = roundInput.extend({ valueId: z.uuid() });
export type ValueRatingInput = z.infer<typeof valueRatingInput>;

/** The structure proposal whose value list goes into a value round (DT3). */
export const valueListInput = z.object({ projectId: idSchema, proposalId: z.uuid() });
export type ValueListInput = z.infer<typeof valueListInput>;

/** One value list of a value round (DT3). */
export const roundValueListInput = roundInput.extend({ proposalId: z.uuid() });
export type RoundValueListInput = z.infer<typeof roundValueListInput>;

/** A proposal for an element missing from round 1 (DE16). */
export const addProposalInput = roundInput.extend({
  name: z.string().trim().min(1).max(PROPOSAL_NAME_MAX),
  description: z.string().trim().max(PROPOSAL_DESCRIPTION_MAX),
});
export type AddProposalInput = z.infer<typeof addProposalInput>;

export const proposalInput = roundInput.extend({ proposalId: z.uuid() });
export type ProposalInput = z.infer<typeof proposalInput>;

/** The details of an element a participant can flag as wrong (DE17); migration 0009 agrees. */
export const DETAIL_FLAG_KINDS = ["data_type", "cardinality", "values"] as const;
export type DetailFlagKind = (typeof DETAIL_FLAG_KINDS)[number];
/** The longest flag reason, the same as a rating reason; migration 0009 agrees. */
export const DETAIL_FLAG_REASON_MAX = RATING_REASON_MAX;

export const detailFlagInput = ratingInput.extend({ kind: z.enum(DETAIL_FLAG_KINDS) });
export type DetailFlagInput = z.infer<typeof detailFlagInput>;

/** A flag on one detail of an element, with the reason it is wrong (DE17). */
export const saveDetailFlagInput = detailFlagInput.extend({
  reason: z.string().trim().min(1).max(DETAIL_FLAG_REASON_MAX),
});
export type SaveDetailFlagInput = z.infer<typeof saveDetailFlagInput>;
