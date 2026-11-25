// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  detailStepProgress,
  firstLookProgress,
  groupCheckProgress,
  ratingProgress,
} from "./task-progress.ts";

describe("the first look's progress", () => {
  it("counts the answers and is done when every element is answered", () => {
    expect(firstLookProgress({ firstLook: { total: 3, answered: 1 } })).toEqual({
      progress: { done: 1, total: 3 },
      done: false,
    });
    expect(firstLookProgress({ firstLook: { total: 3, answered: 3 } }).done).toBe(true);
  });

  it("shows no count and no done state without elements", () => {
    expect(firstLookProgress({ firstLook: { total: 0, answered: 0 } })).toEqual({
      progress: null,
      done: false,
    });
  });
});

describe("the group check's progress", () => {
  it("is done when the member said so", () => {
    expect(groupCheckProgress({ groupCheck: { asked: true, done: true } }).done).toBe(true);
    expect(groupCheckProgress({ groupCheck: { asked: true, done: false } })).toEqual({
      progress: null,
      done: false,
    });
  });
});

describe("the rating progress", () => {
  it("counts the rated elements and is done when all are rated", () => {
    expect(ratingProgress(1, 2)).toEqual({ progress: { done: 1, total: 2 }, done: false });
    expect(ratingProgress(2, 2).done).toBe(true);
    expect(ratingProgress(0, 0)).toEqual({ progress: null, done: false });
  });
});

describe("the detail progress", () => {
  const base = { open: 3, answered: 1, toReview: 0, toPropose: 0, toProposeCodes: 0 };

  it("counts the answers to the open proposals", () => {
    expect(detailStepProgress(base)).toMatchObject({
      progress: { done: 1, total: 3 },
      done: false,
    });
  });

  it("is done once every open proposal is answered and nothing waits", () => {
    expect(detailStepProgress({ ...base, answered: 3 }).done).toBe(true);
  });

  it("keeps an expert busy while they still have to propose or review", () => {
    const answered = { ...base, answered: 3 };
    expect(detailStepProgress({ ...answered, toPropose: 2 })).toMatchObject({
      done: false,
      toPropose: 2,
    });
    expect(detailStepProgress({ ...answered, toProposeCodes: 1 }).done).toBe(false);
    expect(detailStepProgress({ ...answered, toReview: 1 }).done).toBe(false);
  });

  it("has no count and is not done while no proposal is open", () => {
    expect(detailStepProgress({ ...base, open: 0, answered: 0 })).toMatchObject({
      progress: null,
      done: false,
    });
  });
});
