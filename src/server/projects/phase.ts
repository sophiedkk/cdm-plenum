// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The phase of a project and its overview (PR4, PR8, ADR 0013): the facilitator moves the
// project one phase on or back, and every member reads the counts the overview shows.
import type { Kysely } from "kysely";
import { adjacentPhase, isProjectPhase, type ProjectPhase } from "@/lib/project-phases";
import { mayRate, RATER_ROLES } from "@/lib/project-roles";
import type { OverviewRound, ProjectOverview } from "@/lib/project-tasks";
import type { DB } from "../db/schema.gen.ts";
import { ownRatingCode } from "../rounds/rater-link.ts";
import { statusOf } from "../rounds/round.ts";
import { done, type ProjectResult, readProject, refused, withProject } from "./access.ts";
import { log, ownGroupId } from "./queries.ts";
import type { MovePhaseInput } from "./schemas.ts";

/**
 * Moves the project to the next or the previous phase (PR4, facilitator only, `forbidden` for a
 * participant). Refused with `phase_changed` when the project is no longer in `from`, and with
 * `no_next_phase` or `no_previous_phase` past either end. Returns the new phase.
 */
// NOTE: no requirement sets conditions on a move, our own design: the facilitator decides when
// a phase is done, and a move back is allowed, for example to add elements a round showed missing.
export async function movePhase(
  db: Kysely<DB>,
  userId: string,
  input: MovePhaseInput,
): Promise<ProjectResult<{ phase: ProjectPhase }>> {
  return withProject(db, userId, input.projectId, { project: ["update"] }, async (trx, project) => {
    const row = await trx
      .selectFrom("project")
      .select("phase")
      .where("id", "=", project.id)
      .executeTakeFirstOrThrow();
    if (row.phase !== input.from) return refused("phase_changed");
    const to = adjacentPhase(input.from, input.direction);
    if (to === null) {
      return refused(input.direction === "next" ? "no_next_phase" : "no_previous_phase");
    }
    await trx.updateTable("project").set({ phase: to }).where("id", "=", project.id).execute();
    await log(trx, userId, project.id, `phase_moved_to_${to}`, "project", project.id);
    return done({ phase: to });
  });
}

async function count(query: Promise<{ count: string | number | bigint } | undefined>) {
  return Number((await query)?.count ?? 0);
}

/**
 * The counts of the project overview for any member (`not_found` for anyone else). A member
 * sees how many elements they added themselves and answered in the open round; only the
 * facilitator gets the round's response. No count names or singles out another person.
 */
export async function projectOverview(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  deps: { now: Date },
): Promise<ProjectResult<ProjectOverview>> {
  return readProject(db, userId, projectId, null, async (reader, project) => {
    const { phase } = await reader
      .selectFrom("project")
      .select("phase")
      .where("id", "=", project.id)
      .executeTakeFirstOrThrow();
    if (!isProjectPhase(phase)) return refused("not_found");
    const elements = await count(
      reader
        .selectFrom("element")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("project_id", "=", project.id)
        .where("merged_into", "is", null)
        .executeTakeFirst(),
    );
    const ownElements = await count(
      reader
        .selectFrom("element")
        .innerJoin("member", "member.id", "element.author_member_id")
        .select((eb) => eb.fn.countAll<string>().as("count"))
        .where("element.project_id", "=", project.id)
        .where("member.organizationId", "=", project.id)
        .where("member.userId", "=", userId)
        .executeTakeFirst(),
    );
    const lastClosed = await reader
      .selectFrom("round")
      .select("id")
      .where("project_id", "=", project.id)
      .where("closed_at", "is not", null)
      .orderBy("number", "desc")
      .executeTakeFirst();
    return done({
      phase,
      role: project.role,
      elements,
      ownElements,
      round: await runningRound(reader, project.id, project.role, userId, deps.now),
      lastClosedRoundId: lastClosed?.id ?? null,
    });
  });
}

/**
 * The round that is opened and not closed, with the member's own count and, for the
 * facilitator, the response.
 */
async function runningRound(
  db: Kysely<DB>,
  projectId: string,
  role: ProjectOverview["role"],
  userId: string,
  now: Date,
): Promise<OverviewRound | null> {
  const round = await db
    .selectFrom("round")
    .selectAll()
    .where("project_id", "=", projectId)
    .where("opened_at", "is not", null)
    .where("closed_at", "is", null)
    .orderBy("number", "desc")
    .executeTakeFirst();
  if (!round) return null;
  const status = statusOf(round, now);
  if (status !== "open" && status !== "awaiting_close") return null;
  const elements = await count(
    db
      .selectFrom("round_element")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("round_id", "=", round.id)
      .executeTakeFirst(),
  );
  let rated: number | null = null;
  if (mayRate(role, await ownGroupId(db, projectId, userId))) {
    const code = await ownRatingCode(db, projectId, userId);
    rated =
      code === null
        ? 0
        : await count(
            db
              .selectFrom("rating")
              .select((eb) => eb.fn.countAll<string>().as("count"))
              .where("round_id", "=", round.id)
              .where("rating_code_id", "=", code)
              .executeTakeFirst(),
          );
  }
  let completed: number | null = null;
  let raters: number | null = null;
  if (role === "facilitator") {
    raters = await count(
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
    const finished = await db
      .selectFrom("rating")
      .select("rating_code_id")
      .where("round_id", "=", round.id)
      .groupBy("rating_code_id")
      .having((eb) => eb.fn.countAll(), ">=", elements)
      .execute();
    completed = finished.length;
  }
  return {
    id: round.id,
    number: round.number,
    status,
    closesAt: round.closes_at.toISOString(),
    elements,
    rated,
    completed,
    raters,
  };
}
