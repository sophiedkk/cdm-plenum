// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The model type of a project (SC4, ADR 0021): the openEHR entry types that zib 2.0 follows
// (Architectuur zibs 2.0, P4.2), with the cluster as a reusable sub-block. The `project.model_type`
// column holds one of these keys, or null until the facilitator chooses one.
// NOTE: the openEHR modelling guide "What reference model class to use when"
// (<https://openehr.atlassian.net/wiki/spaces/healthmod/pages/2949139>) sets the five types.
import { preparesAhead } from "./phase-access.ts";
import type { ProjectPhase } from "./project-phases.ts";

// NOTE: SC4, EL14, EL18, ADR 0020; no spec governs this, our own design. Every type keeps the four
// question slots and starting groups of migration 0014; their wording follows the type (labels.ts).
// The facilitator renames or adds groups.
export const MODEL_TYPES = [
  "observation",
  "evaluation",
  "instruction",
  "action",
  "cluster",
] as const;
export type ModelType = (typeof MODEL_TYPES)[number];

/** Returns whether `value` names a model type. */
export function isModelType(value: unknown): value is ModelType {
  return typeof value === "string" && (MODEL_TYPES as readonly string[]).includes(value);
}

/**
 * The last phase in which the facilitator sets the model type: the scope phase, and ahead of
 * it (PR10), until the elements are rated in decide.
 */
export const MODEL_TYPE_PHASE: ProjectPhase = "discover";

/** Whether the facilitator may still set the model type during `phase`. */
export function modelTypeOpen(phase: ProjectPhase): boolean {
  return preparesAhead(phase, MODEL_TYPE_PHASE);
}
