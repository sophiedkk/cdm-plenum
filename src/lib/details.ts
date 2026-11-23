// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The structure step of the detail phase (DT1, DT2, ADR 0017): a proposal per element in the
// model and the members' consent answers. The server and the screens share these types.
import type { Cardinality } from "./cardinality.ts";
import type { DataTypeKey } from "./data-types.ts";

/** The consent answers (DT2), in the order of the buttons. */
export const DETAIL_ANSWERS = ["agree", "objection"] as const;
export type DetailAnswer = (typeof DETAIL_ANSWERS)[number];

export function isDetailAnswer(value: unknown): value is DetailAnswer {
  return typeof value === "string" && (DETAIL_ANSWERS as readonly string[]).includes(value);
}

/** The longest objection reason and addressed note. */
export const DETAIL_TEXT_MAX = 2000;

/** One value of a proposed value list: its meaning and, for an ordinal or scale, its number. */
export interface DetailValue {
  text: string;
  value: number | null;
}

/** What a structure proposal sets: the data type, the cardinality and the value list (DT1). */
export interface DetailStructure {
  dataType: DataTypeKey | null;
  cardinality: Cardinality | null;
  values: DetailValue[];
}

/** An objection without its author (EL2): the reason and, once addressed, the facilitator's note. */
export interface DetailObjection {
  id: string;
  /** The version of the proposal it was raised against. */
  version: number;
  reason: string;
  addressedNote: string | null;
}

/** The structure proposal of an element and where its consent stands. */
export interface DetailProposal {
  id: string;
  version: number;
  structure: DetailStructure;
  /** Who proposed: the facilitator or a member of an architecture group (DT1). */
  proposedBy: "facilitator" | "architecture";
  /** When the facilitator settled this version; null while it is open. */
  settledAt: string | null;
  /** The signed-in member's answer to this version; null before they answer. */
  own: { answer: DetailAnswer; reason: string | null } | null;
  /**
   * The answers to this version, for the facilitator and the proposers; null for anyone else.
   * The objections carry no name.
   */
  answers: { agreed: number; objections: DetailObjection[] } | null;
  /** Objections to earlier versions with their notes (owner decision 2026-11-23); same readers. */
  history: DetailObjection[] | null;
}

/** An element of a source model linked to the element (EL4), as the proposer starts from it. */
export interface DetailSource {
  model: string;
  name: string;
  /** The type as the source model names it, such as DV_QUANTITY or Quantity. */
  type: string | null;
  cardinality: Cardinality | null;
}

/** A detail flag a rater set during a round (DE17), without its author. */
export interface DetailFlagNote {
  kind: "data_type" | "cardinality" | "values";
  reason: string;
}

/** An element in the model with its proposal and what the proposer starts from. */
export interface DetailElement {
  id: string;
  name: string;
  description: string;
  /** What the element carries now: the last settled structure, or what the board set. */
  current: DetailStructure;
  proposal: DetailProposal | null;
  sources: DetailSource[];
  /** The detail flags of the rounds, for the facilitator only; null for anyone else (DE17). */
  flags: DetailFlagNote[] | null;
}

/** The structure step of the detail phase for the signed-in member. */
export interface DetailBoard {
  /** Whether the member may propose: the facilitator, or a member of an architecture group. */
  mayPropose: boolean;
  /** Whether the member answers proposals: a participant (DT2). */
  mayAnswer: boolean;
  /** Whether the phase takes answers, objection notes and settling now. */
  open: boolean;
  elements: DetailElement[];
}

/** Whether a proposal waits for the member's answer: open, and not answered in this version. */
export function waitsForAnswer(proposal: DetailProposal | null): boolean {
  return proposal !== null && proposal.settledAt === null && proposal.own === null;
}

/** The objections of the current version that the facilitator has not addressed yet. */
export function openObjections(proposal: DetailProposal): DetailObjection[] {
  return (proposal.answers?.objections ?? []).filter(
    (objection) => objection.addressedNote === null,
  );
}
