// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { type CodeGroup, shownGroups } from "./rating-groups.ts";

function codes(groups: Record<string, number>, none = 0): CodeGroup[] {
  const list: CodeGroup[] = [];
  for (const [group, count] of Object.entries(groups)) {
    for (let i = 0; i < count; i += 1) {
      list.push({ code: `${group}-${i}`, groupId: `id-${group}`, groupName: group });
    }
  }
  for (let i = 0; i < none; i += 1)
    list.push({ code: `none-${i}`, groupId: null, groupName: null });
  return list;
}

function shown(result: Map<string, string | null>): string[] {
  return [...new Set([...result.values()].filter((name) => name !== null))].sort();
}

describe("shownGroups (Q-PRIV-3)", () => {
  it("shows every group with at least 3 raters", () => {
    const result = shownGroups(codes({ Nursing: 3, Patient: 5 }));
    expect(shown(result)).toEqual(["Nursing", "Patient"]);
    expect(result.get("Nursing-0")).toBe("Nursing");
  });

  it("leaves a group of 1 or 2 empty and hides the next smallest group as cover", () => {
    const result = shownGroups(codes({ Patient: 1, Terminology: 3, Nursing: 4 }));
    expect(result.get("Patient-0")).toBeNull();
    expect(result.get("Terminology-0")).toBeNull();
    expect(shown(result)).toEqual(["Nursing"]);
  });

  it("needs no cover when the small groups together hold 3 raters", () => {
    const result = shownGroups(codes({ Patient: 1, Architecture: 2, Nursing: 3 }));
    expect(shown(result)).toEqual(["Nursing"]);
  });

  it("hides every group when no group reaches 3 raters", () => {
    const result = shownGroups(codes({ Patient: 2, Nursing: 2 }));
    expect(shown(result)).toEqual([]);
    expect(result.size).toBe(4);
  });

  it("leaves a code without a group empty and does not count it as cover", () => {
    const result = shownGroups(codes({ Patient: 1, Nursing: 3 }, 2));
    expect(result.get("none-0")).toBeNull();
    expect(shown(result)).toEqual([]);
  });

  it("returns an empty map for no codes", () => {
    expect(shownGroups([]).size).toBe(0);
  });
});
