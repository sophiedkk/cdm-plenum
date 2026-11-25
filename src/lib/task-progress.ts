// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The numbers a participant's task bar shows on a step page (P1 of the UI/UX analysis of
// 2026-11-25, PR8). They come from the same overview the home reads, so the page and the home
// never disagree; the components only choose the words.
import type { DetailCounts, ProjectOverview } from "./project-tasks.ts";

/** What the bar of a step page shows: the progress, and whether nothing is left. */
export interface StepProgress {
  /** The count to show; null when there is nothing to count yet. */
  progress: { done: number; total: number } | null;
  done: boolean;
}

/** The first look (EL22): answered of the elements from existing models. */
export function firstLookProgress(overview: Pick<ProjectOverview, "firstLook">): StepProgress {
  const { answered, total } = overview.firstLook;
  return {
    progress: total === 0 ? null : { done: answered, total },
    done: total > 0 && answered >= total,
  };
}

/** The group check (EL24) is done once the member said so; there is no count. */
export function groupCheckProgress(overview: Pick<ProjectOverview, "groupCheck">): StepProgress {
  return { progress: null, done: overview.groupCheck.done };
}

/** The rating page counts from its own cards, so a saved score counts at once (DE18). */
export function ratingProgress(rated: number, total: number): StepProgress {
  return {
    progress: total === 0 ? null : { done: rated, total },
    done: total > 0 && rated >= total,
  };
}

/** What an expert still has to do on the detail page, next to the answers (DT1 to DT4). */
export interface DetailStepProgress extends StepProgress {
  toReview: number;
  toPropose: number;
  toProposeCodes: number;
}

/**
 * The detail page: answered of the open proposals, and what an architect or terminologist still
 * proposes or reviews. A member is done when every count is settled and there was something to do.
 */
export function detailStepProgress(detail: DetailCounts): DetailStepProgress {
  const { open, answered, toReview, toPropose, toProposeCodes } = detail;
  const nothingLeft = answered >= open && toReview === 0 && toPropose === 0 && toProposeCodes === 0;
  return {
    progress: open === 0 ? null : { done: answered, total: open },
    done: open > 0 && nothingLeft,
    toReview,
    toPropose,
    toProposeCodes,
  };
}
