// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facts behind the participant's project home, the facilitator's Overview checklist and the
// projects list (PR4, PR8, PR11). Every count is a number of elements, comments or raters; no
// fact names or singles out a person (Q-ANON-1).
import type { Kysely } from "kysely";
import type { Outcome } from "@/lib/consensus";
import { EXPERT_TYPES, type ExpertType } from "@/lib/panel";
import { stepVisible } from "@/lib/phase-access";
import {
  type ChecklistRound,
  type DecidedElement,
  type DecidedSoFar,
  type OverviewFacts,
  type Waiting,
  waitingFor,
} from "@/lib/project-home";
import type { ProjectPhase } from "@/lib/project-phases";
import { type ProjectRole, RATER_ROLES } from "@/lib/project-roles";
import type { DB } from "../db/schema.gen.ts";
import { detailProgress } from "../details/queries.ts";
import { summaryOf } from "../elements/first-look.ts";
import { checkProgress } from "../elements/groups.ts";
import { markSummary } from "../elements/marks.ts";
import { completedMemberCount } from "../rounds/consent.ts";
import { joinedPanel, projectPanel } from "../rounds/queries.ts";
import { type RoundKind, statusOf } from "../rounds/round.ts";
import { done, type LockedProject, type ProjectResult, readProject } from "./access.ts";
import { modeOf } from "./member.ts";
import { projectOverview } from "./phase.ts";
import { listProjects } from "./queries.ts";

async function count(query: Promise<{ count: string | number | bigint } | undefined>) {
  return Number((await query)?.count ?? 0);
}

/** The elements of the board with the outcome of the newest closed round that rated each. */
async function decided(db: Kysely<DB>, projectId: string): Promise<DecidedSoFar> {
  const elements = await db
    .selectFrom("element")
    .select(["id", "name"])
    .where("project_id", "=", projectId)
    .where("merged_into", "is", null)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  const outcomes = await db
    .selectFrom("round_element")
    .innerJoin("round", "round.id", "round_element.round_id")
    .distinctOn("round_element.element_id")
    .select(["round_element.element_id", "round_element.outcome"])
    .where("round.project_id", "=", projectId)
    .where("round.kind", "=", "elements")
    .where("round.closed_at", "is not", null)
    .orderBy("round_element.element_id")
    .orderBy("round.number", "desc")
    .execute();
  const outcomeOf = new Map(outcomes.map((row) => [row.element_id, row.outcome as Outcome | null]));
  const lastClosed = await db
    .selectFrom("round")
    .select(["id", "number"])
    .where("project_id", "=", projectId)
    .where("kind", "=", "elements")
    .where("closed_at", "is not", null)
    .orderBy("number", "desc")
    .executeTakeFirst();
  return {
    elements: elements.map(
      (element): DecidedElement => ({
        id: element.id,
        name: element.name,
        status: outcomeOf.get(element.id) ?? "not_rated",
      }),
    ),
    lastClosedRound: lastClosed ?? null,
  };
}

/**
 * Where each element of the board stands (PR8), for any member (`not_found` for anyone else).
 * A participant gets an empty list before the rounds' step opens to them (PR9), so nothing shows
 * elements of a private brainstorm early (EL13).
 */
export async function decidedSoFar(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<DecidedSoFar>> {
  return readProject(db, userId, projectId, null, async (reader, project) => {
    if (!stepVisible(project.role, project.phase, "rounds")) {
      return done({ elements: [], lastClosedRound: null });
    }
    return done(await decided(reader, project.id));
  });
}

/**
 * The newest round of the kind that is not closed, with its response, as the facilitator
 * follows it: an element round in decide, a value round in detail (DT3).
 */
async function followedRound(
  db: Kysely<DB>,
  projectId: string,
  now: Date,
  kind: RoundKind,
): Promise<ChecklistRound | null> {
  const round = await db
    .selectFrom("round")
    .selectAll()
    .where("project_id", "=", projectId)
    .where("kind", "=", kind)
    .where("closed_at", "is", null)
    .orderBy("number", "desc")
    .executeTakeFirst();
  if (!round) return null;
  const status = statusOf(round, now);
  if (status === "closed") return null;
  const elements = await count(
    db
      .selectFrom(kind === "values" ? "round_value" : "round_element")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("round_id", "=", round.id)
      .executeTakeFirst(),
  );
  const raters = await count(
    db
      .selectFrom("teamMember")
      .innerJoin("team", "team.id", "teamMember.teamId")
      .innerJoin("member", (join) =>
        join
          .onRef("member.userId", "=", "teamMember.userId")
          .onRef("member.organizationId", "=", "team.organizationId"),
      )
      .select((eb) => eb.fn.count<string>("member.id").distinct().as("count"))
      .where("team.organizationId", "=", projectId)
      .where("member.role", "in", RATER_ROLES)
      .executeTakeFirst(),
  );
  // One row per rater code that answered every element; the code never leaves this query.
  const team = kind === "elements" && (await modeOf(db, projectId)) === "team";
  const finished = team
    ? new Array(await completedMemberCount(db, round.id, elements))
    : await db
        .selectFrom(kind === "values" ? "value_rating" : "rating")
        .select("rating_code_id")
        .where("round_id", "=", round.id)
        .groupBy("rating_code_id")
        .having((eb) => eb.fn.countAll(), ">=", elements)
        .execute();
  return {
    id: round.id,
    number: round.number,
    status,
    closesAt: round.closes_at.toISOString(),
    completed: elements === 0 ? 0 : finished.length,
    raters,
  };
}

/**
 * People still to invite before the joined raters and the pending invitations reach the minimum
 * panel per expert type (DE11). An invitation counts as soon as it is sent.
 */
async function panelMissing(db: Kysely<DB>, projectId: string, now: Date): Promise<number> {
  const { minimum } = await projectPanel(db, projectId);
  const joined = await joinedPanel(db, projectId);
  const invited = await db
    .selectFrom("invitation")
    .innerJoin("team", "team.id", "invitation.teamId")
    .select("team.expert_type")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("invitation.organizationId", "=", projectId)
    .where("invitation.status", "=", "pending")
    .where("invitation.expiresAt", ">", now)
    .groupBy("team.expert_type")
    .execute();
  const pending = new Map(invited.map((row) => [row.expert_type, Number(row.count)]));
  return EXPERT_TYPES.reduce(
    (sum, type: ExpertType) =>
      sum + Math.max(0, minimum[type] - joined[type] - (pending.get(type) ?? 0)),
    0,
  );
}

async function factsOf(
  db: Kysely<DB>,
  userId: string,
  project: LockedProject,
  deps: { now: Date; mailConfigured: boolean },
): Promise<OverviewFacts> {
  const row = await db
    .selectFrom("project")
    .select(["private_brainstorm", "board_revealed_at", "model_type"])
    .where("id", "=", project.id)
    .executeTakeFirstOrThrow();
  const scope = await db
    .selectFrom("scope_statement")
    .select("concept")
    .where("project_id", "=", project.id)
    .executeTakeFirst();
  const scopeComments = await count(
    db
      .selectFrom("scope_comment")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("project_id", "=", project.id)
      .executeTakeFirst(),
  );
  const participants = await count(
    db
      .selectFrom("member")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("organizationId", "=", project.id)
      .where("role", "=", "participant")
      .executeTakeFirst(),
  );
  // A merged element still counts: its author added it.
  const contributors = await count(
    db
      .selectFrom("member")
      .select((eb) => eb.fn.count<string>("member.id").distinct().as("count"))
      .innerJoin("element", "element.author_member_id", "member.id")
      .where("member.organizationId", "=", project.id)
      .where("member.role", "=", "participant")
      .where("element.project_id", "=", project.id)
      .executeTakeFirst(),
  );
  const importedModels = await count(
    db
      .selectFrom("source_model")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("project_id", "=", project.id)
      .where("status", "=", "imported")
      .executeTakeFirst(),
  );
  const listedFromModels = await count(
    db
      .selectFrom("element_source_link")
      .innerJoin("element", "element.id", "element_source_link.element_id")
      .select((eb) => eb.fn.count<string>("element.id").distinct().as("count"))
      .where("element.project_id", "=", project.id)
      .where("element.merged_into", "is", null)
      .executeTakeFirst(),
  );
  const marks = await markSummary(db, userId, project.id);
  const look = await summaryOf(db, project.id);
  const check = await checkProgress(db, project.id);
  const { elements, lastClosedRound } = await decided(db, project.id);
  return {
    scopeWritten: (scope?.concept ?? "").trim() !== "",
    modelTypeSet: row.model_type !== null,
    scopeComments,
    panelMissing: await panelMissing(db, project.id, deps.now),
    participants,
    contributors,
    elements: elements.length,
    privateBrainstorm: row.private_brainstorm,
    boardRevealed: row.board_revealed_at !== null,
    duplicates: marks.ok ? marks.value.duplicates.length : 0,
    importedModels,
    listedFromModels,
    firstLookTotal: look.total,
    firstLookFinished: look.finished,
    groupCheckAsked: check.asked,
    groupChecked: check.checked,
    round: await followedRound(db, project.id, deps.now, "elements"),
    valueRound: await followedRound(db, project.id, deps.now, "values"),
    undecided: elements.filter(
      (element) => element.status === "no_consensus" || element.status === "not_rated",
    ).length,
    lastClosedRound,
    detail:
      project.phase === "detail" || project.phase === "handoff"
        ? await detailProgress(db, project.id)
        : { inModel: 0, proposed: 0, settled: 0, codable: 0, codesSettled: 0, openObjections: 0 },
    mailConfigured: deps.mailConfigured,
  };
}

/** The facts of the facilitator's Overview checklist (facilitator only, `forbidden` otherwise). */
export async function overviewFacts(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  deps: { now: Date; mailConfigured: boolean },
): Promise<ProjectResult<OverviewFacts>> {
  return readProject(db, userId, projectId, { project: ["update"] }, async (reader, project) =>
    done(await factsOf(reader, userId, project, deps)),
  );
}

/** A project in the user's list with what waits for them there. */
export interface ProjectRow {
  id: string;
  name: string;
  phase: ProjectPhase;
  role: ProjectRole;
  waiting: Waiting;
}

/**
 * The user's projects with what waits for them in each (PR2, PR8): a participant's task, or
 * the facilitator's open checklist items. Projects with something waiting come first, then by
 * name.
 */
export async function listProjectRows(
  db: Kysely<DB>,
  userId: string,
  deps: { now: Date; mailConfigured: boolean },
): Promise<ProjectRow[]> {
  const rows: ProjectRow[] = [];
  for (const project of await listProjects(db, userId)) {
    const overview = await projectOverview(db, userId, project.id, deps);
    if (!overview.ok) continue;
    const facts =
      project.role === "facilitator" ? await overviewFacts(db, userId, project.id, deps) : null;
    const waiting = waitingFor(overview.value, facts?.ok ? facts.value : null);
    rows.push({ ...project, waiting });
  }
  const waits = (row: ProjectRow) => (row.waiting.kind === "nothing" ? 1 : 0);
  // The list from listProjects is sorted by name; a stable sort keeps that within each part.
  return rows.sort((a, b) => waits(a) - waits(b));
}
