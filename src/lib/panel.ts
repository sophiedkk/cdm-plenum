// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The minimum panel (DE11 to DE13). NOTE: Beheerafspraken zib's V1.0, section "Analyseren/in
// analyse": the minimum number of experts per change class. Applying it to a rating panel is our
// own adaptation; it is a guideline, never a gate (ADR 0010).

export const EXPERT_TYPES = ["clinical", "terminology", "architecture"] as const;
export type ExpertType = (typeof EXPERT_TYPES)[number];

export const CHANGE_CLASSES = ["A", "B", "C", "D"] as const;
export type ChangeClass = (typeof CHANGE_CLASSES)[number];

export const DEFAULT_CHANGE_CLASS: ChangeClass = "D";

export type PanelCounts = Record<ExpertType, number>;

export const MINIMUM_PANEL: Readonly<Record<ChangeClass, Readonly<PanelCounts>>> = {
  A: { clinical: 1, terminology: 0, architecture: 1 },
  B: { clinical: 2, terminology: 1, architecture: 1 },
  C: { clinical: 2, terminology: 1, architecture: 2 },
  D: { clinical: 2, terminology: 1, architecture: 2 },
};

/** The minimum for a class, with the project's own counts (DE13) replacing the class default. */
export function minimumPanel(
  changeClass: ChangeClass,
  overrides: Partial<PanelCounts> = {},
): PanelCounts {
  const minimum = { ...MINIMUM_PANEL[changeClass] };
  for (const type of EXPERT_TYPES) {
    const value = overrides[type];
    if (value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) {
      throw new Error(`minimum for ${type} must be a whole number of 0 or more`);
    }
    minimum[type] = value;
  }
  return minimum;
}

export interface Shortfall {
  expertType: ExpertType;
  joined: number;
  minimum: number;
}

/** The expert types below their minimum, in the order of EXPERT_TYPES; empty when complete. */
export function panelShortfall(
  joined: Partial<PanelCounts>,
  minimum: Readonly<PanelCounts>,
): Shortfall[] {
  return EXPERT_TYPES.flatMap((expertType) => {
    const count = joined[expertType] ?? 0;
    return count < minimum[expertType]
      ? [{ expertType, joined: count, minimum: minimum[expertType] }]
      : [];
  });
}

export type OpenRoundCheck =
  | { status: "complete" }
  | { status: "below_minimum"; shortfall: Shortfall[]; reason: string }
  | { status: "reason_required"; shortfall: Shortfall[] };

/**
 * Decides whether a round may open (DE12): a complete panel opens; a panel below the minimum opens
 * with a non-blank reason; without one the facilitator is asked for it. Never refuses outright.
 */
export function checkOpenRound(
  joined: Partial<PanelCounts>,
  minimum: Readonly<PanelCounts>,
  reason: string | undefined,
): OpenRoundCheck {
  const shortfall = panelShortfall(joined, minimum);
  if (shortfall.length === 0) return { status: "complete" };
  const trimmed = reason?.trim() ?? "";
  if (trimmed === "") return { status: "reason_required", shortfall };
  return { status: "below_minimum", shortfall, reason: trimmed };
}
