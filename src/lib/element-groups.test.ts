// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { groupOrder } from "./element-groups.ts";

const GROUPS = ["recorded", "patient_state", "method", "context", "device"];

describe("groupOrder (DE19)", () => {
  it("keeps every group once", () => {
    expect(groupOrder(GROUPS, "code-1:round-1").sort()).toEqual([...GROUPS].sort());
  });

  it("gives the same order for the same seed", () => {
    expect(groupOrder(GROUPS, "code-1:round-1")).toEqual(groupOrder(GROUPS, "code-1:round-1"));
  });

  it("gives participants different orders", () => {
    const orders = new Set(
      Array.from({ length: 20 }, (_, index) => groupOrder(GROUPS, `code-${index}:round-1`).join()),
    );
    expect(orders.size).toBeGreaterThan(5);
  });

  it("leaves an empty list and one group as they are", () => {
    expect(groupOrder([], "seed")).toEqual([]);
    expect(groupOrder(["recorded"], "seed")).toEqual(["recorded"]);
  });
});
