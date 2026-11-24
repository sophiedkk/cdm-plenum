// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Reading a round and its ratings, shared by the round actions. Nothing here reads who rated:
// ratings are grouped by element and stakeholder group only (ADR 0005).
import type { Kysely, Selectable } from "kysely";
import {
  type ConsensusRule,
  type ElementResult,
  elementResult,
  groupResults,
  type Outcome,
} from "@/lib/consensus";
import { type ElementReference, toReference } from "@/lib/elements";
import { EXPERT_TYPES, type PanelCounts } from "@/lib/panel";
import type { DB, Round } from "../db/schema.gen.ts";

export type RoundRow = Selectable<Round>;

/** What a round rates: elements (DE1), or the values of structure proposals (DT3). */
export const ROUND_KINDS = ["elements", "values"] as const;
export type RoundKind = (typeof ROUND_KINDS)[number];

export function kindOf(round: Pick<RoundRow, "kind">): RoundKind {
  return round.kind === "values" ? "values" : "elements";
}

/**
 * A round's state. `awaiting_close`: the closing date has passed, so the database takes no more
 * ratings, and the facilitator has not closed it yet.
 */
export type RoundStatus = "draft" | "open" | "awaiting_close" | "closed";

export function statusOf(round: RoundRow, now: Date): RoundStatus {
  if (round.opened_at === null) return "draft";
  if (round.closed_at !== null) return "closed";
  return now >= round.closes_at ? "awaiting_close" : "open";
}

export function ruleOf(round: RoundRow): ConsensusRule {
  return {
    scaleMin: round.scale_min,
    scaleMax: round.scale_max,
    bottomBandMax: round.bottom_band_max,
    topBandMin: round.top_band_min,
    agreementPct: Number(round.agreement_pct),
    oppositionPct: Number(round.opposition_pct),
  };
}

/** What every member may know about a round, and what participants see before they rate (DE4). */
export interface RoundSummary {
  id: string;
  /** What the round rates; both kinds share the project's round numbers (DT3). */
  kind: RoundKind;
  number: number;
  status: RoundStatus;
  rule: ConsensusRule;
  facilitatorSeesRaters: boolean;
  /** The rule for adding proposed elements (DE16); round 1 only, null when none is set. */
  proposalRule: string | null;
  closesAt: string;
  openedAt: string | null;
  closedAt: string | null;
}

/** Only element round 1 asks for missing elements (DE16). */
export function takesProposals(round: Pick<RoundRow, "number" | "kind">): boolean {
  return round.number === 1 && kindOf(round) === "elements";
}

export function summaryOf(round: RoundRow, now: Date): RoundSummary {
  return {
    id: round.id,
    kind: kindOf(round),
    number: round.number,
    status: statusOf(round, now),
    rule: ruleOf(round),
    facilitatorSeesRaters: round.facilitator_sees_raters,
    proposalRule: round.proposal_rule,
    closesAt: round.closes_at.toISOString(),
    openedAt: round.opened_at?.toISOString() ?? null,
    closedAt: round.closed_at?.toISOString() ?? null,
  };
}

/** The panel and the minimum when the round opened, and the reason when it was below (DE12). */
export interface PanelSnapshot {
  panel: PanelCounts;
  minimum: PanelCounts;
  belowMinimumReason: string | null;
}

export function snapshotOf(round: RoundRow): PanelSnapshot | null {
  if (round.opened_at === null) return null;
  const panel = {} as PanelCounts;
  const minimum = {} as PanelCounts;
  for (const type of EXPERT_TYPES) {
    panel[type] = round[`panel_${type}`] ?? 0;
    minimum[type] = round[`minimum_${type}`] ?? 0;
  }
  return { panel, minimum, belowMinimumReason: round.below_minimum_reason };
}

/** The round of the project, optionally locked: `for share` for a rating, `for update` to change. */
export async function findRound(
  db: Kysely<DB>,
  projectId: string,
  roundId: string,
  lock?: "share" | "update",
): Promise<RoundRow | undefined> {
  let query = db
    .selectFrom("round")
    .selectAll()
    .where("id", "=", roundId)
    .where("project_id", "=", projectId);
  if (lock === "share") query = query.forShare();
  if (lock === "update") query = query.forUpdate();
  return query.executeTakeFirst();
}

export interface RoundElementRow {
  id: string;
  name: string;
  description: string;
  /** The model a reference element refers to (EL26); null for a data element. */
  reference: ElementReference | null;
  outcome: Outcome | null;
  /** In a value round (DT3): the value's number and the element whose value list holds it. */
  value?: RoundValueOf;
}

/** Where an item of a value round comes from (DT3). */
export interface RoundValueOf {
  /** The value's ordinal number; null for a coded text. */
  number: number | null;
  elementId: string;
  elementName: string;
  proposalId: string;
}

/** The elements of a round in the order of the board: oldest first. */
export async function roundElements(db: Kysely<DB>, roundId: string): Promise<RoundElementRow[]> {
  const rows = await db
    .selectFrom("round_element")
    .innerJoin("element", "element.id", "round_element.element_id")
    .select([
      "element.id",
      "element.name",
      "element.description",
      "element.kind",
      "element.reference_title",
      "element.reference_url",
      "round_element.outcome",
    ])
    .where("round_element.round_id", "=", roundId)
    .orderBy("element.created_at")
    .orderBy("element.id")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    reference: toReference(row),
    outcome: row.outcome as Outcome | null,
  }));
}

/**
 * The values of a value round (DT3), element by element in the order of the board and each list
 * in its own order. A value is named by its text; its element is its heading.
 */
export async function roundValues(db: Kysely<DB>, roundId: string): Promise<RoundElementRow[]> {
  const rows = await db
    .selectFrom("round_value")
    .innerJoin("detail_proposal", "detail_proposal.id", "round_value.proposal_id")
    .innerJoin("element", "element.id", "detail_proposal.element_id")
    .select([
      "round_value.id",
      "round_value.text",
      "round_value.value",
      "round_value.outcome",
      "round_value.proposal_id",
      "element.id as element_id",
      "element.name as element_name",
    ])
    .where("round_value.round_id", "=", roundId)
    .orderBy("element.created_at")
    .orderBy("element.id")
    .orderBy("round_value.position")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.text,
    description: "",
    reference: null,
    outcome: row.outcome as Outcome | null,
    value: {
      number: row.value === null ? null : Number(row.value),
      elementId: row.element_id,
      elementName: row.element_name,
      proposalId: row.proposal_id,
    },
  }));
}

/** What a round rates: its elements, or the values of a value round (DT3). */
export async function roundItems(
  db: Kysely<DB>,
  round: Pick<RoundRow, "id" | "kind">,
): Promise<RoundElementRow[]> {
  return kindOf(round) === "values" ? roundValues(db, round.id) : roundElements(db, round.id);
}

interface ElementScores {
  all: (number | null)[];
  byGroup: Map<string, (number | null)[]>;
}

/** Every score of a round per item, and per stakeholder group of the rater. */
export async function scoresOf(
  db: Kysely<DB>,
  round: Pick<RoundRow, "id" | "kind">,
): Promise<Map<string, ElementScores>> {
  const rows =
    kindOf(round) === "values"
      ? await db
          .selectFrom("value_rating")
          .select(["value_id as item_id", "team_id", "score"])
          .where("round_id", "=", round.id)
          .execute()
      : await db
          .selectFrom("rating")
          .select(["element_id as item_id", "team_id", "score"])
          .where("round_id", "=", round.id)
          .execute();
  const scores = new Map<string, ElementScores>();
  for (const row of rows) {
    let element = scores.get(row.item_id);
    if (!element) {
      element = { all: [], byGroup: new Map() };
      scores.set(row.item_id, element);
    }
    element.all.push(row.score);
    if (row.team_id !== null) {
      const group = element.byGroup.get(row.team_id) ?? [];
      group.push(row.score);
      element.byGroup.set(row.team_id, group);
    }
  }
  return scores;
}

export interface GroupResult {
  groupId: string;
  groupName: string;
  result: ElementResult;
}

export interface ElementOutcome {
  result: ElementResult;
  /** Only stakeholder groups with at least MIN_GROUP_SCORES scores (Q-PRIV-3). */
  groups: GroupResult[];
}

/** The overall and per-group result of every element of a closed round (DE5). */
export async function outcomesOf(
  db: Kysely<DB>,
  round: RoundRow,
): Promise<Map<string, ElementOutcome>> {
  const rule = ruleOf(round);
  const scores = await scoresOf(db, round);
  const teams = await db
    .selectFrom("team")
    .select(["id", "name"])
    .where("organizationId", "=", round.project_id)
    .execute();
  const teamName = new Map(teams.map((team) => [team.id, team.name]));
  const outcomes = new Map<string, ElementOutcome>();
  for (const [elementId, element] of scores) {
    const groups = [...groupResults(element.byGroup, rule)]
      .map(([groupId, result]) => ({ groupId, groupName: teamName.get(groupId) ?? "", result }))
      .sort((a, b) => a.groupName.localeCompare(b.groupName) || a.groupId.localeCompare(b.groupId));
    outcomes.set(elementId, { result: elementResult(element.all, rule), groups });
  }
  return outcomes;
}

/** The result of an element nobody rated. */
export function emptyOutcome(round: RoundRow): ElementOutcome {
  return { result: elementResult([], ruleOf(round)), groups: [] };
}
