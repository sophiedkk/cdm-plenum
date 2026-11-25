// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The structure step of the detail phase (DT1, DT2, ADR 0017): a proposal per element in the
// model and the members' consent answers. The server and the screens share these types.
import type { Cardinality } from "./cardinality.ts";
import type { DataTypeKey } from "./data-types.ts";
import type { ElementReference } from "./elements.ts";

/**
 * The consent answers (DT2), in the order of the buttons. "leave" hands the decision to the
 * experts: it counts as answered, is no objection and no agreement (owner decision 2026-11-25).
 */
export const DETAIL_ANSWERS = ["agree", "objection", "leave"] as const;
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

/** What a structure proposal sets: the data type, cardinality, value list and units (DT1). */
export interface DetailStructure {
  dataType: DataTypeKey | null;
  cardinality: Cardinality | null;
  values: DetailValue[];
  /** The allowed UCUM units of a quantity, the first preferred (issue #71); empty for other types. */
  units: string[];
}

/**
 * An objection: the reason and, once addressed, the facilitator's note. The author is present
 * in a Team project only (PR14, ADR 0023); a Delphi project sends none (EL2).
 */
export interface DetailObjection {
  id: string;
  author?: { name: string } | null;
  /** The version of the proposal it was raised against. */
  version: number;
  reason: string;
  addressedNote: string | null;
}

/** Where the consent of one proposal stands, whatever it proposes (DT2). */
export interface ConsentState {
  id: string;
  version: number;
  /** When the facilitator settled this version; null while it is open. */
  settledAt: string | null;
  /** The signed-in member's answer to this version; null before they answer. */
  own: { answer: DetailAnswer; reason: string | null } | null;
  /**
   * The answers to this version, for the facilitator and the proposers of its kind; null for
   * anyone else. The objections carry no name.
   */
  answers: { agreed: number; left: number; objections: DetailObjection[] } | null;
  /** Objections to earlier versions with their notes (owner decision 2026-11-23); same readers. */
  history: DetailObjection[] | null;
}

/** The structure proposal of an element and where its consent stands (DT1). */
export interface DetailProposal extends ConsentState {
  structure: DetailStructure;
  /** Who proposed: the facilitator or a member of an architecture group (DT1). */
  proposedBy: "facilitator" | "architecture";
}

/** The kinds of a detail proposal: the structure first, then the codes (ADR 0017). */
export const DETAIL_KINDS = ["structure", "terminology"] as const;
export type DetailKind = (typeof DETAIL_KINDS)[number];

/**
 * The binding strengths FHIR, zibs and ADL2 share (DT5,
 * <https://hl7.org/fhir/R4/terminologies.html#binding>), from strictest to loosest.
 */
export const BINDING_STRENGTHS = ["required", "extensible", "preferred", "example"] as const;
export type BindingStrength = (typeof BINDING_STRENGTHS)[number];

export function isBindingStrength(value: unknown): value is BindingStrength {
  return typeof value === "string" && (BINDING_STRENGTHS as readonly string[]).includes(value);
}

/**
 * The code systems the code form offers by name, with their FHIR system URI
 * (<https://hl7.org/fhir/R4/terminologies-systems.html>); any other system is typed as a URI.
 */
export const CODE_SYSTEMS = [
  { key: "snomed", label: "SNOMED CT", uri: "http://snomed.info/sct" },
  { key: "loinc", label: "LOINC", uri: "http://loinc.org" },
] as const;

/** The name of a code system for the screens: SNOMED CT, LOINC, or its URI. */
export function codeSystemLabel(uri: string): string {
  return CODE_SYSTEMS.find((system) => system.uri === uri)?.label ?? uri;
}

/** The longest code system URI, code, display and value set URL the form takes. */
export const CODE_SYSTEM_MAX = 200;
export const CODE_MAX = 100;
export const CODE_DISPLAY_MAX = 200;
export const VALUE_SET_URL_MAX = 500;

/** A code in a code system, such as LOINC 8480-6 "Systolic blood pressure" (DT5). */
export interface DetailCode {
  system: string;
  code: string;
  display: string | null;
}

/** What a code proposal sets: the element code, the binding and a code per value (DT5). */
export interface DetailCodes {
  code: DetailCode | null;
  bindingStrength: BindingStrength | null;
  valueSetUrl: string | null;
  /** One entry per value of the settled value list, in its order; null for a value without a code. */
  valueCodes: (DetailCode | null)[];
}

/** Where the review of a code proposal by a second terminologist stands (DT4). */
export const REVIEW_STATES = ["pending", "approved", "returned", "skipped"] as const;
export type ReviewState = (typeof REVIEW_STATES)[number];

/** Whether the group may answer a code proposal in this review state (owner decision 2026-11-23). */
export function reviewDone(state: ReviewState): boolean {
  return state === "approved" || state === "skipped";
}

/** The code proposal of an element, its review and where its consent stands (DT4, DT5). */
export interface CodeProposal extends ConsentState {
  codes: DetailCodes;
  /** Who proposed: the facilitator or a member of a terminology group (DT4). */
  proposedBy: "facilitator" | "terminology";
  review: {
    state: ReviewState;
    /** The reviewer's note on a returned proposal, or the facilitator's reason for skipping. */
    note: string | null;
    /** Whether the signed-in member made this version, so they may not review it. */
    ownProposal: boolean;
    /** Whether no other terminologist can review, so the facilitator may skip (DT4). */
    skippable: boolean;
  };
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
  /** The model a reference element refers to (EL26); null for a data element. */
  reference: ElementReference | null;
  /** What the element carries now: the last settled structure, or what the board set. */
  current: DetailStructure;
  proposal: DetailProposal | null;
  /** The codes the element carries now: the last settled code proposal, or none. */
  currentCodes: DetailCodes;
  /**
   * The code proposal; null before there is one, or while it waits for review and the member is
   * neither the facilitator nor a terminologist (owner decision 2026-11-23: a review gates it).
   */
  codes: CodeProposal | null;
  /** Whether a code proposal exists that the member cannot read yet, because it is in review. */
  codesInReview: boolean;
  sources: DetailSource[];
  /** The detail flags of the rounds, for the facilitator only; null for anyone else (DE17). */
  flags: DetailFlagNote[] | null;
  /**
   * The newest value round that rates the structure proposal's values (DT3); a participant
   * does not see a draft. Null when there is none.
   */
  valueRound: DetailValueRound | null;
}

/** A value round as an element's card names it (DT3). */
export interface DetailValueRound {
  id: string;
  number: number;
  status: "draft" | "open" | "awaiting_close" | "closed";
  /** The version of the structure proposal the round rates. */
  version: number;
  /** The version applying its kept values made; null until the facilitator applies them. */
  appliedVersion: number | null;
}

/** The structure step of the detail phase for the signed-in member. */
export interface DetailBoard {
  /**
   * Whether the member reads the technical form (RM and FHIR types, `min..max`, binding): the
   * facilitator, an architect or a terminologist (P4, owner decision 2026-11-25).
   */
  modeller: boolean;
  /** Whether the member may propose a structure: the facilitator, or an architect (DT1). */
  mayPropose: boolean;
  /** Whether the member may propose codes: the facilitator, or a terminologist (DT4). */
  mayProposeCodes: boolean;
  /** Whether the member reviews code proposals: a participant in a terminology group (DT4). */
  mayReview: boolean;
  /** Whether the member answers proposals: a participant (DT2). */
  mayAnswer: boolean;
  /** Whether the phase takes answers, objection notes and settling now. */
  open: boolean;
  /**
   * For the facilitator: whether a value list can go to a value round now (DT3), and the draft
   * value round it would join; null when a new one would start.
   */
  valueRounds: { mayStart: boolean; draft: { id: string; number: number } | null } | null;
  elements: DetailElement[];
}

/** The objections of the current version that the facilitator has not addressed yet. */
export function openObjections(proposal: ConsentState): DetailObjection[] {
  return (proposal.answers?.objections ?? []).filter(
    (objection) => objection.addressedNote === null,
  );
}
