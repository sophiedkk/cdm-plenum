// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The helpers of the tree of the model (DT6): nesting, order, loops and the moves of the editor.
import { describe, expect, it } from "vitest";
import {
  ancestry,
  depthFirst,
  descendants,
  hasCycle,
  moveGroup,
  nestGroups,
  newGroupId,
  shiftGroup,
  type TreeGroup,
} from "./model-tree.ts";

const g = (id: string, parentId: string | null = null): TreeGroup => ({
  id,
  name: id,
  prompt: null,
  parentId,
  cardinality: null,
  subBlock: false,
  subBlockLink: null,
});

/** Measurement > Cuff, Measurement > Method, State. */
const TREE = [g("measurement"), g("cuff", "measurement"), g("method", "measurement"), g("state")];
const ids = (groups: readonly { id: string }[]) => groups.map((group) => group.id);

describe("nestGroups and depthFirst", () => {
  it("nests the groups under their parents in list order", () => {
    const nested = nestGroups(TREE);
    expect(nested.map((node) => [node.group.id, ids(node.children.map((c) => c.group))])).toEqual([
      ["measurement", ["cuff", "method"]],
      ["state", []],
    ]);
  });

  it("puts each group before the groups inside it, and a group with a lost parent at the top", () => {
    expect(ids(depthFirst([g("cuff", "measurement"), g("state"), g("measurement")]))).toEqual([
      "state",
      "measurement",
      "cuff",
    ]);
    expect(ids(depthFirst([g("orphan", "gone")]))).toEqual(["orphan"]);
  });
});

describe("hasCycle", () => {
  it("finds a group inside itself, directly or through others", () => {
    expect(hasCycle(new Map([["a", "a"]]))).toBe(true);
    expect(
      hasCycle(
        new Map([
          ["a", "b"],
          ["b", "c"],
          ["c", "a"],
        ]),
      ),
    ).toBe(true);
    expect(
      hasCycle(
        new Map([
          ["a", null],
          ["b", "a"],
          ["c", "b"],
        ]),
      ),
    ).toBe(false);
  });
});

describe("ancestry and descendants", () => {
  it("walks up from a group and down from it", () => {
    expect(ids(ancestry(TREE, "cuff"))).toEqual(["measurement", "cuff"]);
    expect([...descendants(TREE, "measurement")].sort()).toEqual(["cuff", "method"]);
    expect(descendants(TREE, "state").size).toBe(0);
  });
});

describe("the editor's moves", () => {
  it("moves a group with its groups into another, and back to the top", () => {
    const moved = moveGroup(TREE, "measurement", "state");
    expect(moved.map((group) => [group.id, group.parentId])).toEqual([
      ["state", null],
      ["measurement", "state"],
      ["cuff", "measurement"],
      ["method", "measurement"],
    ]);
    expect(ids(moveGroup(moved, "measurement", null))).toEqual([
      "state",
      "measurement",
      "cuff",
      "method",
    ]);
  });

  it("never moves a group into itself or into a group inside it", () => {
    expect(moveGroup(TREE, "measurement", "measurement")).toEqual(TREE);
    expect(moveGroup(TREE, "measurement", "cuff")).toEqual(TREE);
  });

  it("swaps a group with its sibling, and does nothing at either end", () => {
    expect(ids(shiftGroup(TREE, "method", -1))).toEqual(["measurement", "method", "cuff", "state"]);
    expect(ids(shiftGroup(TREE, "state", -1))).toEqual(["state", "measurement", "cuff", "method"]);
    expect(shiftGroup(TREE, "cuff", -1)).toEqual(TREE);
    expect(shiftGroup(TREE, "state", 1)).toEqual(TREE);
  });
});

describe("newGroupId", () => {
  it("makes a version 4 UUID", () => {
    expect(newGroupId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(newGroupId()).not.toBe(newGroupId());
  });
});
