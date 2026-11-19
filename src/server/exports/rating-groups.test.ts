// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { type RatedGroup, shownGroups } from "./rating-groups.ts";

/** Two ratings per participant, `count` participants per group, plus `none` without a group. */
function rows(groups: Record<string, number>, none = 0): RatedGroup[] {
  const list: RatedGroup[] = [];
  for (const [group, count] of Object.entries(groups)) {
    for (let i = 0; i < count; i += 1) {
      list.push(
        { code: `${group}-${i}`, groupId: group },
        { code: `${group}-${i}`, groupId: group },
      );
    }
  }
  for (let i = 0; i < none; i += 1) list.push({ code: `none-${i}`, groupId: null });
  return list;
}

const sorted = (set: Set<string>) => [...set].sort();

describe("shownGroups (Q-PRIV-3)", () => {
  it("names every group with at least 3 participants, counting each participant once", () => {
    expect(sorted(shownGroups(rows({ Nursing: 3, Patient: 5 })))).toEqual(["Nursing", "Patient"]);
  });

  it("leaves out a group of 1 or 2 and the next smallest group as cover", () => {
    expect(sorted(shownGroups(rows({ Patient: 1, Terminology: 3, Nursing: 4 })))).toEqual([
      "Nursing",
    ]);
  });

  it("needs no cover when the small groups together hold 3 participants", () => {
    expect(sorted(shownGroups(rows({ Patient: 1, Architecture: 2, Nursing: 3 })))).toEqual([
      "Nursing",
    ]);
  });

  it("names no group when none reaches 3 participants", () => {
    expect(sorted(shownGroups(rows({ Patient: 2, Nursing: 2 })))).toEqual([]);
  });

  it("does not count a rating without a group as cover", () => {
    expect(sorted(shownGroups(rows({ Patient: 1, Nursing: 3 }, 2)))).toEqual([]);
  });

  it("counts a participant who changed groups in both", () => {
    const moved: RatedGroup[] = [
      ...rows({ Nursing: 2, Patient: 3 }),
      { code: "Patient-0", groupId: "Nursing" },
    ];
    expect(sorted(shownGroups(moved))).toEqual(["Nursing", "Patient"]);
  });

  it("returns no group for no ratings", () => {
    expect(shownGroups([]).size).toBe(0);
  });
});
