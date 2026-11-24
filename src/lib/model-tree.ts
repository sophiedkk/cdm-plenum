// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The tree of the model (DT6, ADR 0021, after Architectuur zibs 2.0, P2.6 and P3.3): groups that
// nest, each with a cardinality, a group marked as a sub-block, and elements marked as
// registration elements. The groups travel as a flat list in depth-first order, each naming its
// parent; the server, the editor and the views share these types and helpers.
import type { ElementPrompt } from "./brainstorm.ts";
import type { Cardinality } from "./cardinality.ts";
import type { ConsentState } from "./details.ts";

/** The longest sub-block title and link; migration 0021 agrees. */
export const SUB_BLOCK_TITLE_MAX = 300;
export const SUB_BLOCK_URL_MAX = 2000;
/** The most groups and elements one tree proposal carries. */
export const TREE_GROUPS_MAX = 200;
export const TREE_ELEMENTS_MAX = 1000;

/** An existing sub-block a group is linked to, such as an openEHR CLUSTER archetype. */
export interface SubBlockLink {
  title: string;
  url: string | null;
}

/** A group in the tree. */
export interface TreeGroup {
  id: string;
  /** The given name; null keeps the translated name of `prompt`. */
  name: string | null;
  prompt: ElementPrompt | null;
  /** The group it sits in; null for a group at the top of the model. */
  parentId: string | null;
  cardinality: Cardinality | null;
  /** Reusable and not a model on its own (P2.6). */
  subBlock: boolean;
  /** The existing sub-block it is, if any; only for a sub-block. */
  subBlockLink: SubBlockLink | null;
}

/** An element in the model as the tree places it. */
export interface TreeElement {
  id: string;
  name: string;
  /** Its group; null for "Not grouped yet". */
  groupId: string | null;
  /** Modelled explicitly, and may be hidden from care providers (P3.3). */
  registration: boolean;
}

/** A tree: the groups in depth-first order and the elements in the model. */
export interface ModelTree {
  groups: TreeGroup[];
  elements: TreeElement[];
}

/** What a tree proposal sends: the groups in depth-first order and the elements. */
export interface TreeInput {
  groups: {
    id: string;
    /** The name of a group the proposal adds; null for a group the project has. */
    name: string | null;
    parentId: string | null;
    cardinality: Cardinality | null;
    subBlock: boolean;
    subBlockLink: SubBlockLink | null;
  }[];
  elements: { id: string; groupId: string | null; registration: boolean }[];
}

/** The tree proposal of the project and where its consent stands (DT6, DT2). */
export interface TreeProposal extends ConsentState {
  tree: ModelTree;
  /** Who proposed: the facilitator or a member of an architecture group. */
  proposedBy: "facilitator" | "architecture";
}

/** The tree step for the signed-in member. */
export interface TreeBoard {
  /** The tree the project has now: the last settled one, or the groups of discover (EL18). */
  current: ModelTree;
  proposal: TreeProposal | null;
  /** Whether the member may propose the tree: the facilitator, or an architect. */
  mayPropose: boolean;
  /** Whether the member answers the proposal: a participant (DT2). */
  mayAnswer: boolean;
  /** Whether the phase takes answers, objection notes and settling now. */
  open: boolean;
}

/** A group with the groups inside it, for a nested view. */
export interface TreeNode {
  group: TreeGroup;
  children: TreeNode[];
}

/** The groups as nested nodes, keeping the order of the list among siblings. */
export function nestGroups(groups: readonly TreeGroup[]): TreeNode[] {
  const nodes = new Map(groups.map((group) => [group.id, { group, children: [] as TreeNode[] }]));
  const roots: TreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.group.parentId === null ? undefined : nodes.get(node.group.parentId);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  return roots;
}

/** The groups in depth-first order: each group followed by the groups inside it. */
export function depthFirst<G extends { id: string; parentId: string | null }>(
  groups: readonly G[],
): G[] {
  const ids = new Set(groups.map((group) => group.id));
  const children = new Map<string | null, G[]>();
  for (const group of groups) {
    const parent = group.parentId !== null && ids.has(group.parentId) ? group.parentId : null;
    children.set(parent, [...(children.get(parent) ?? []), group]);
  }
  const out: G[] = [];
  const visit = (parent: string | null, seen: Set<string>) => {
    for (const group of children.get(parent) ?? []) {
      if (seen.has(group.id)) continue;
      seen.add(group.id);
      out.push(group);
      visit(group.id, seen);
    }
  };
  visit(null, new Set());
  return out;
}

/**
 * A random version 4 UUID (RFC 9562, section 5.4) for a group the proposer adds; the group keeps
 * it once settled. `getRandomValues` works outside a secure context, unlike `randomUUID`.
 */
export function newGroupId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Whether following the parents from any group comes back to it. */
export function hasCycle(parents: ReadonlyMap<string, string | null>): boolean {
  for (const start of parents.keys()) {
    const seen = new Set<string>([start]);
    let current = parents.get(start) ?? null;
    while (current !== null) {
      if (seen.has(current)) return true;
      seen.add(current);
      current = parents.get(current) ?? null;
    }
  }
  return false;
}

/** The group and the groups above it, from the top of the model down. */
export function ancestry<G extends { id: string; parentId: string | null }>(
  groups: readonly G[],
  id: string,
): G[] {
  const byId = new Map(groups.map((group) => [group.id, group]));
  const path: G[] = [];
  const seen = new Set<string>();
  let current = byId.get(id);
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId === null ? undefined : byId.get(current.parentId);
  }
  return path;
}

/** The ids of the groups inside `id`, at any depth. */
export function descendants(
  groups: readonly { id: string; parentId: string | null }[],
  id: string,
): Set<string> {
  const out = new Set<string>();
  let frontier = [id];
  while (frontier.length > 0) {
    const next = groups
      .filter((group) => group.parentId !== null && frontier.includes(group.parentId))
      .map((group) => group.id)
      .filter((child) => !out.has(child) && child !== id);
    for (const child of next) out.add(child);
    frontier = next;
  }
  return out;
}

/**
 * Moves a group, with what is inside it, into `targetId` as its last child, or to the top of the
 * model with null. A move into the group itself or into a group inside it changes nothing.
 */
export function moveGroup<G extends { id: string; parentId: string | null }>(
  groups: readonly G[],
  id: string,
  targetId: string | null,
): G[] {
  if (targetId === id || (targetId !== null && descendants(groups, id).has(targetId))) {
    return [...groups];
  }
  const moving = groups.find((group) => group.id === id);
  if (!moving) return [...groups];
  const rest = groups.filter((group) => group.id !== id);
  return depthFirst([...rest, { ...moving, parentId: targetId }]);
}

/** Swaps a group with its sibling before (-1) or after (+1) it; nothing at either end. */
export function shiftGroup<G extends { id: string; parentId: string | null }>(
  groups: readonly G[],
  id: string,
  step: -1 | 1,
): G[] {
  const moving = groups.find((group) => group.id === id);
  if (!moving) return [...groups];
  const siblings = groups.filter((group) => group.parentId === moving.parentId);
  const index = siblings.findIndex((group) => group.id === id);
  const other = siblings[index + step];
  if (!other) return [...groups];
  const order = groups.map((group) => group.id);
  const a = order.indexOf(id);
  const b = order.indexOf(other.id);
  const swapped = [...groups];
  swapped[a] = other;
  swapped[b] = moving;
  return depthFirst(swapped);
}
