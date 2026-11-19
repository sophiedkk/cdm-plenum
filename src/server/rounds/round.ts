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
import { EXPERT_TYPES, type PanelCounts } from "@/lib/panel";
import type { DB, Round } from "../db/schema.gen.ts";

export type RoundRow = Selectable<Round>;

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
  number: number;
  status: RoundStatus;
  rule: ConsensusRule;
  facilitatorSeesRaters: boolean;
  closesAt: string;
  openedAt: string | null;
  closedAt: string | null;
}

export function summaryOf(round: RoundRow, now: Date): RoundSummary {
  return {
    id: round.id,
    number: round.number,
    status: statusOf(round, now),
    rule: ruleOf(round),
    facilitatorSeesRaters: round.facilitator_sees_raters,
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
  outcome: Outcome | null;
}

/** The elements of a round in the order of the board: oldest first. */
export async function roundElements(db: Kysely<DB>, roundId: string): Promise<RoundElementRow[]> {
  const rows = await db
    .selectFrom("round_element")
    .innerJoin("element", "element.id", "round_element.element_id")
    .select(["element.id", "element.name", "element.description", "round_element.outcome"])
    .where("round_element.round_id", "=", roundId)
    .orderBy("element.created_at")
    .orderBy("element.id")
    .execute();
  return rows.map((row) => ({ ...row, outcome: row.outcome as Outcome | null }));
}

interface ElementScores {
  all: (number | null)[];
  byGroup: Map<string, (number | null)[]>;
}

/** Every score of a round per element, and per stakeholder group of the rater. */
export async function scoresOf(
  db: Kysely<DB>,
  roundId: string,
): Promise<Map<string, ElementScores>> {
  const rows = await db
    .selectFrom("rating")
    .select(["element_id", "team_id", "score"])
    .where("round_id", "=", roundId)
    .execute();
  const scores = new Map<string, ElementScores>();
  for (const row of rows) {
    let element = scores.get(row.element_id);
    if (!element) {
      element = { all: [], byGroup: new Map() };
      scores.set(row.element_id, element);
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
  const scores = await scoresOf(db, round.id);
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
