// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Setting up, opening and closing e-Delphi rounds (DE1, DE2, DE7, DE11 to DE13), and the change
// class and minimum panel of a project. Ratings are in ratings.ts, results in results.ts.
import type { Kysely, Transaction } from "kysely";
import { DEFAULT_RULE, elementResult, type Outcome, ruleError } from "@/lib/consensus";
import {
  CHANGE_CLASSES,
  type ChangeClass,
  checkOpenRound,
  EXPERT_TYPES,
  type ExpertType,
  MINIMUM_PANEL,
  minimumPanel,
  type PanelCounts,
  panelShortfall,
  type Shortfall,
} from "@/lib/panel";
import type { DB } from "../db/schema.gen.ts";
import { log } from "../projects/queries.ts";
import { asFacilitator, asMember, done, type RoundResult, refused } from "./access.ts";
import {
  findRound,
  type PanelSnapshot,
  type RoundElementRow,
  type RoundRow,
  type RoundSummary,
  roundElements,
  ruleOf,
  scoresOf,
  snapshotOf,
  summaryOf,
} from "./round.ts";
import type {
  ChangeClassInput,
  CreateRoundInput,
  OpenRoundInput,
  PanelMinimumInput,
  RoundInput,
  RuleInput,
  UpdateRoundInput,
} from "./schemas.ts";

/** Whether a round of the project has opened; the class and the minimum are fixed from then. */
async function anyRoundOpened(trx: Kysely<DB>, projectId: string): Promise<boolean> {
  const row = await trx
    .selectFrom("round")
    .select("id")
    .where("project_id", "=", projectId)
    .where("opened_at", "is not", null)
    .executeTakeFirst();
  return row !== undefined;
}

/** Sets the change class of the project (DE11), until the first round opens. */
export async function setChangeClass(
  db: Kysely<DB>,
  userId: string,
  input: ChangeClassInput,
): Promise<RoundResult<null>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    if (await anyRoundOpened(trx, project.id)) return refused("panel_locked");
    await trx
      .updateTable("project")
      .set({ change_class: input.changeClass })
      .where("id", "=", project.id)
      .execute();
    await log(trx, userId, project.id, "change_class_set", "project", project.id);
    return done(null);
  });
}

/** Replaces the class default of one expert type, or drops the project's count (DE13). */
export async function setPanelMinimum(
  db: Kysely<DB>,
  userId: string,
  input: PanelMinimumInput,
): Promise<RoundResult<null>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    if (await anyRoundOpened(trx, project.id)) return refused("panel_locked");
    if (input.minimum === null) {
      await trx
        .deleteFrom("project_panel_minimum")
        .where("project_id", "=", project.id)
        .where("expert_type", "=", input.expertType)
        .execute();
    } else {
      await trx
        .insertInto("project_panel_minimum")
        .values({ project_id: project.id, expert_type: input.expertType, minimum: input.minimum })
        .onConflict((oc) =>
          oc.columns(["project_id", "expert_type"]).doUpdateSet({ minimum: input.minimum ?? 0 }),
        )
        .execute();
    }
    await log(trx, userId, project.id, "panel_minimum_set", "project", project.id);
    return done(null);
  });
}

/** Joined participants per expert type: members of a stakeholder group of the project. */
async function joinedPanel(trx: Kysely<DB>, projectId: string): Promise<PanelCounts> {
  const rows = await trx
    .selectFrom("member")
    .innerJoin("teamMember", "teamMember.userId", "member.userId")
    .innerJoin("team", "team.id", "teamMember.teamId")
    .select(["team.expert_type"])
    .select((eb) => eb.fn.count<string>("member.id").distinct().as("count"))
    .where("member.organizationId", "=", projectId)
    .where("team.organizationId", "=", projectId)
    .where("member.role", "=", "participant")
    .groupBy("team.expert_type")
    .execute();
  const joined: PanelCounts = { clinical: 0, terminology: 0, architecture: 0 };
  for (const row of rows) {
    if ((EXPERT_TYPES as readonly string[]).includes(row.expert_type)) {
      joined[row.expert_type as ExpertType] = Number(row.count);
    }
  }
  return joined;
}

interface ProjectPanel {
  changeClass: ChangeClass;
  overrides: Partial<PanelCounts>;
  minimum: PanelCounts;
}

async function projectPanel(trx: Kysely<DB>, projectId: string): Promise<ProjectPanel> {
  const project = await trx
    .selectFrom("project")
    .select("change_class")
    .where("id", "=", projectId)
    .executeTakeFirstOrThrow();
  const changeClass = CHANGE_CLASSES.find((key) => key === project.change_class);
  if (!changeClass) throw new Error(`unknown change class: ${project.change_class}`);
  const rows = await trx
    .selectFrom("project_panel_minimum")
    .select(["expert_type", "minimum"])
    .where("project_id", "=", projectId)
    .execute();
  const overrides: Partial<PanelCounts> = {};
  for (const row of rows) overrides[row.expert_type as ExpertType] = row.minimum;
  return { changeClass, overrides, minimum: minimumPanel(changeClass, overrides) };
}

export interface PanelStatus {
  changeClass: ChangeClass;
  /** The minimum of the class, before the project's own counts (DE13). */
  classDefault: PanelCounts;
  /** The expert types where the project replaced the class default. */
  overrides: Partial<PanelCounts>;
  minimum: PanelCounts;
  joined: PanelCounts;
  /** Empty when the panel meets the minimum. */
  shortfall: Shortfall[];
  /** True once a round opened: the class and the minimum no longer change. */
  locked: boolean;
}

/** The panel per expert type next to the minimum, for the round setup screen (DE11). */
export async function panelStatus(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<RoundResult<PanelStatus>> {
  return asFacilitator(db, userId, projectId, async (trx, project) => {
    const panel = await projectPanel(trx, project.id);
    const joined = await joinedPanel(trx, project.id);
    return done({
      changeClass: panel.changeClass,
      classDefault: { ...MINIMUM_PANEL[panel.changeClass] },
      overrides: panel.overrides,
      minimum: panel.minimum,
      joined,
      shortfall: panelShortfall(joined, panel.minimum),
      locked: await anyRoundOpened(trx, project.id),
    });
  });
}

/** The rule of `base` with the facilitator's changes; a rule `ruleError` refuses is reported. */
function ruleWith(base: typeof DEFAULT_RULE, changes: RuleInput | undefined) {
  const rule = { ...base };
  for (const [key, value] of Object.entries(changes ?? {})) {
    if (value !== undefined) rule[key as keyof typeof rule] = value;
  }
  return { rule, problem: ruleError(rule) };
}

/**
 * Checks that every id is a distinct, unmerged element of the project. The board's merge keeps
 * only the surviving element (EL5), so a merged one is never rated.
 */
async function validElementIds(
  trx: Kysely<DB>,
  projectId: string,
  ids: readonly string[],
): Promise<string[] | null> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const rows = await trx
    .selectFrom("element")
    .select("id")
    .where("project_id", "=", projectId)
    .where("merged_into", "is", null)
    .where("id", "in", unique)
    .execute();
  return rows.length === unique.length ? unique : null;
}

/**
 * The elements a new round rates by default (DE7): those without consensus in the previous
 * round, or every unmerged element for the first round.
 */
async function defaultElementIds(
  trx: Kysely<DB>,
  projectId: string,
  previous: RoundRow | undefined,
): Promise<string[]> {
  let query = trx
    .selectFrom("element")
    .select("element.id")
    .where("element.project_id", "=", projectId)
    .where("element.merged_into", "is", null);
  if (previous) {
    query = query
      .innerJoin("round_element", "round_element.element_id", "element.id")
      .where("round_element.round_id", "=", previous.id)
      .where("round_element.outcome", "=", "no_consensus" satisfies Outcome);
  }
  const rows = await query.orderBy("element.created_at").orderBy("element.id").execute();
  return rows.map((row) => row.id);
}

async function setRoundElements(
  trx: Transaction<DB>,
  roundId: string,
  elementIds: readonly string[],
): Promise<void> {
  await trx.deleteFrom("round_element").where("round_id", "=", roundId).execute();
  if (elementIds.length === 0) return;
  await trx
    .insertInto("round_element")
    .values(elementIds.map((elementId) => ({ round_id: roundId, element_id: elementId })))
    .execute();
}

/**
 * Creates a round in draft (DE1): the next number, the DE1 rule with the facilitator's changes,
 * and the elements to rate. Only one round runs at a time, so the previous round must be closed.
 */
export async function createRound(
  db: Kysely<DB>,
  userId: string,
  input: CreateRoundInput,
  deps: { now: Date },
): Promise<RoundResult<{ roundId: string; number: number }>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    const previous = await trx
      .selectFrom("round")
      .selectAll()
      .where("project_id", "=", project.id)
      .orderBy("number", "desc")
      .limit(1)
      .executeTakeFirst();
    if (previous && previous.closed_at === null) return refused("previous_round_not_closed");
    const { rule, problem } = ruleWith(DEFAULT_RULE, input.rule);
    if (problem) return { ok: false, error: "rule_invalid", rule: problem };
    if (input.closesAt <= deps.now) return refused("closes_at_past");
    const elementIds =
      input.elementIds === undefined
        ? await defaultElementIds(trx, project.id, previous)
        : await validElementIds(trx, project.id, input.elementIds);
    if (elementIds === null) return refused("element_not_found");
    const number = (previous?.number ?? 0) + 1;
    const round = await trx
      .insertInto("round")
      .values({
        project_id: project.id,
        number,
        scale_min: rule.scaleMin,
        scale_max: rule.scaleMax,
        bottom_band_max: rule.bottomBandMax,
        top_band_min: rule.topBandMin,
        agreement_pct: rule.agreementPct,
        opposition_pct: rule.oppositionPct,
        facilitator_sees_raters: input.facilitatorSeesRaters ?? false,
        closes_at: input.closesAt,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await setRoundElements(trx, round.id, elementIds);
    await log(trx, userId, project.id, "round_created", "round", round.id);
    return done({ roundId: round.id, number });
  });
}

/**
 * Changes a draft round: the rule, the closing date, the rater setting and the elements. Once
 * the round is open nothing of it changes (DE2); the database refuses it as well.
 */
export async function updateRound(
  db: Kysely<DB>,
  userId: string,
  input: UpdateRoundInput,
  deps: { now: Date },
): Promise<RoundResult<null>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    const round = await findRound(trx, project.id, input.roundId, "update");
    if (!round) return refused("round_not_found");
    if (round.opened_at !== null) return refused("round_not_draft");
    const { rule, problem } = ruleWith(ruleOf(round), input.rule);
    if (problem) return { ok: false, error: "rule_invalid", rule: problem };
    if (input.closesAt !== undefined && input.closesAt <= deps.now) {
      return refused("closes_at_past");
    }
    if (input.elementIds !== undefined) {
      const elementIds = await validElementIds(trx, project.id, input.elementIds);
      if (elementIds === null) return refused("element_not_found");
      await setRoundElements(trx, round.id, elementIds);
    }
    await trx
      .updateTable("round")
      .set({
        scale_min: rule.scaleMin,
        scale_max: rule.scaleMax,
        bottom_band_max: rule.bottomBandMax,
        top_band_min: rule.topBandMin,
        agreement_pct: rule.agreementPct,
        opposition_pct: rule.oppositionPct,
        facilitator_sees_raters: input.facilitatorSeesRaters ?? round.facilitator_sees_raters,
        closes_at: input.closesAt ?? round.closes_at,
      })
      .where("id", "=", round.id)
      .execute();
    await log(trx, userId, project.id, "round_updated", "round", round.id);
    return done(null);
  });
}

export interface OpenedRound {
  /** `below_minimum`: opened with the facilitator's reason (DE12). */
  status: "complete" | "below_minimum";
  shortfall: Shortfall[];
}

/**
 * Opens a draft round (DE12). In one transaction it counts the joined panel per expert type and
 * compares it with the minimum; below it, the round opens only with a reason, and otherwise
 * returns `reason_required` so the screen asks for one. Never refused for the panel alone.
 */
export async function openRound(
  db: Kysely<DB>,
  userId: string,
  input: OpenRoundInput,
  deps: { now: Date },
): Promise<RoundResult<OpenedRound>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    const round = await findRound(trx, project.id, input.roundId, "update");
    if (!round) return refused("round_not_found");
    if (round.opened_at !== null) return refused("round_not_draft");
    if (round.closes_at <= deps.now) return refused("closes_at_past");
    const elements = await trx
      .selectFrom("round_element")
      .select("element_id")
      .where("round_id", "=", round.id)
      .limit(1)
      .execute();
    if (elements.length === 0) return refused("round_has_no_elements");
    const { minimum } = await projectPanel(trx, project.id);
    const joined = await joinedPanel(trx, project.id);
    const check = checkOpenRound(joined, minimum, input.belowMinimumReason);
    if (check.status === "reason_required") {
      return { ok: false, error: "reason_required", shortfall: check.shortfall };
    }
    await trx
      .updateTable("round")
      .set({
        opened_at: deps.now,
        panel_clinical: joined.clinical,
        panel_terminology: joined.terminology,
        panel_architecture: joined.architecture,
        minimum_clinical: minimum.clinical,
        minimum_terminology: minimum.terminology,
        minimum_architecture: minimum.architecture,
        below_minimum_reason: check.status === "below_minimum" ? check.reason : null,
      })
      .where("id", "=", round.id)
      .execute();
    await log(trx, userId, project.id, "round_opened", "round", round.id);
    return done({
      status: check.status,
      shortfall: check.status === "below_minimum" ? check.shortfall : [],
    });
  });
}

export type OutcomeCounts = Record<Outcome, number>;

/**
 * Closes a round once its closing date has passed and writes each element's outcome under the
 * round's rule, in one transaction (DE5). The facilitator closes; a read never writes.
 * NOTE: our own design, no requirement sets it. Closing before the closing date would shorten
 * a date DE2 fixes, so it is refused; after the date the database already takes no ratings.
 */
export async function closeRound(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
  deps: { now: Date },
): Promise<RoundResult<OutcomeCounts>> {
  return asFacilitator(db, userId, input.projectId, async (trx, project) => {
    const round = await findRound(trx, project.id, input.roundId, "update");
    if (!round) return refused("round_not_found");
    if (round.opened_at === null || round.closed_at !== null) return refused("round_not_open");
    if (deps.now < round.closes_at) return refused("round_not_due");
    const rule = ruleOf(round);
    const scores = await scoresOf(trx, round.id);
    const counts: OutcomeCounts = { included: 0, excluded: 0, no_consensus: 0 };
    for (const element of await roundElements(trx, round.id)) {
      const { outcome } = elementResult(scores.get(element.id)?.all ?? [], rule);
      counts[outcome] += 1;
      await trx
        .updateTable("round_element")
        .set({ outcome })
        .where("round_id", "=", round.id)
        .where("element_id", "=", element.id)
        .execute();
    }
    await trx
      .updateTable("round")
      .set({ closed_at: deps.now })
      .where("id", "=", round.id)
      .execute();
    await log(trx, userId, project.id, "round_closed", "round", round.id);
    return done(counts);
  });
}

/** The rounds of a project, newest first; a participant does not see a draft. */
export async function listRounds(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  deps: { now: Date },
): Promise<RoundResult<RoundSummary[]>> {
  return asMember(db, userId, projectId, async (trx, role) => {
    let query = trx.selectFrom("round").selectAll().where("project_id", "=", projectId);
    if (role !== "facilitator") query = query.where("opened_at", "is not", null);
    const rows = await query.orderBy("number", "desc").execute();
    return done(rows.map((row) => summaryOf(row, deps.now)));
  });
}

export interface RoundDetail extends RoundSummary {
  elements: RoundElementRow[];
  /** The panel when the round opened (DE12); null for a draft. */
  snapshot: PanelSnapshot | null;
}

/** One round with its elements and opening snapshot; a participant gets no draft. */
export async function getRound(
  db: Kysely<DB>,
  userId: string,
  input: RoundInput,
  deps: { now: Date },
): Promise<RoundResult<RoundDetail>> {
  return asMember(db, userId, input.projectId, async (trx, role) => {
    const round = await findRound(trx, input.projectId, input.roundId);
    if (!round || (round.opened_at === null && role !== "facilitator")) {
      return refused("round_not_found");
    }
    return done({
      ...summaryOf(round, deps.now),
      elements: await roundElements(trx, round.id),
      snapshot: snapshotOf(round),
    });
  });
}
