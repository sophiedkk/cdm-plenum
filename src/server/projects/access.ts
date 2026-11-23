// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The access rule of every project write (Q-SEC-1, R-01): the project role comes from a
// membership query on the session user, inside the transaction that writes, with the project
// row locked. A user without a role in the project gets `not_found`, never a hint that the
// project exists (docs/architecture.md, "Roles and access").
import type { Kysely, Transaction } from "kysely";
import { type ParticipantWrite, writeOpen } from "@/lib/phase-access";
import { isProjectPhase, type ProjectPhase } from "@/lib/project-phases";
import {
  isProjectRole,
  type ProjectPermission,
  type ProjectRole,
  projectCan,
} from "@/lib/project-roles";
import type { DB } from "../db/schema.gen.ts";

/** Why a project action was refused; the screens map each code to a translated message. */
export const PROJECT_ACTION_ERRORS = [
  "not_found",
  "forbidden",
  "group_not_found",
  "group_name_taken",
  "group_not_empty",
  "already_member",
  "already_invited",
  "invitation_not_found",
  "scope_source_not_found",
  "scope_source_order_mismatch",
  "element_not_found",
  "element_in_round",
  "element_has_values",
  "values_not_allowed",
  "value_number_required",
  "value_number_not_allowed",
  "value_number_not_integer",
  "merge_values_conflict",
  "rater_group_locked",
  "board_already_revealed",
  "merge_before_reveal",
  "phase_changed",
  "no_next_phase",
  "no_previous_phase",
  "phase_closed",
  "reveal_outside_discover",
  "round_still_open",
  "marks_before_reveal",
  "same_as_itself",
  "mail_not_configured",
  "reminder_outside_discover",
  "element_group_not_found",
  "groups_after_discover",
  "group_check_before_reveal",
  "group_check_not_asked",
  "recap_not_ready",
  "private_after_group_check",
  "detail_not_in_model",
  "detail_not_architect",
  "detail_version_changed",
  "detail_proposal_not_found",
  "detail_settled",
  "detail_answer_not_found",
  "detail_objections_open",
] as const;
export type ProjectActionError = (typeof PROJECT_ACTION_ERRORS)[number];

/** The outcome of a project action: done with a value, or refused with a code. */
export type ProjectResult<T> = { ok: true; value: T } | { ok: false; error: ProjectActionError };

export function done<T>(value: T): ProjectResult<T> {
  return { ok: true, value };
}

export function refused<T>(error: ProjectActionError): ProjectResult<T> {
  return { ok: false, error };
}

/** The locked project and the actor's role in it. */
export interface LockedProject {
  id: string;
  name: string;
  role: ProjectRole;
  /** The phase when the row was read; under `lockProject` it cannot change before the commit. */
  phase: ProjectPhase;
}

/**
 * Locks the project row and returns it with the actor's role, or `null` when the id is no
 * project or the actor is no member. One query: the membership is the filter.
 */
export async function lockProject(
  trx: Kysely<DB>,
  projectId: string,
  userId: string,
): Promise<LockedProject | null> {
  const row = await trx
    .selectFrom("project")
    .innerJoin("organization", "organization.id", "project.id")
    .innerJoin("member", "member.organizationId", "project.id")
    .select(["project.id", "organization.name", "member.role", "project.phase"])
    .where("project.id", "=", projectId)
    .where("member.userId", "=", userId)
    .forUpdate("project")
    .executeTakeFirst();
  if (!row || !isProjectRole(row.role) || !isProjectPhase(row.phase)) return null;
  return { id: row.id, name: row.name, role: row.role, phase: row.phase };
}

/**
 * Runs `action` in one transaction after the checks: a membership (`not_found` otherwise) and
 * the role's permission (`forbidden`).
 */
export async function withProject<T>(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  permission: ProjectPermission,
  action: (trx: Transaction<DB>, project: LockedProject) => Promise<ProjectResult<T>>,
): Promise<ProjectResult<T>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, projectId, userId);
    if (!project) return refused<T>("not_found");
    if (!projectCan(project.role, permission)) return refused<T>("forbidden");
    return action(trx, project);
  });
}

/**
 * Runs a read after the same checks as `withProject`: a membership (`not_found` otherwise) and,
 * when given, the role's permission (`forbidden`). It takes no lock, so readers never wait on a
 * writer or on each other.
 */
export async function readProject<T>(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  permission: ProjectPermission | null,
  action: (db: Kysely<DB>, project: LockedProject) => Promise<ProjectResult<T>>,
): Promise<ProjectResult<T>> {
  const row = await db
    .selectFrom("project")
    .innerJoin("organization", "organization.id", "project.id")
    .innerJoin("member", "member.organizationId", "project.id")
    .select(["project.id", "organization.name", "member.role", "project.phase"])
    .where("project.id", "=", projectId)
    .where("member.userId", "=", userId)
    .executeTakeFirst();
  if (!row || !isProjectRole(row.role) || !isProjectPhase(row.phase)) {
    return refused<T>("not_found");
  }
  if (permission !== null && !projectCan(row.role, permission)) return refused<T>("forbidden");
  return action(db, { id: row.id, name: row.name, role: row.role, phase: row.phase });
}

/**
 * Whether the current phase lets the member make `write` (PR9). The phase is read again under a
 * share lock, so a phase move waits until this write commits and never slips in between.
 */
export async function phaseOpenFor(
  trx: Kysely<DB>,
  project: LockedProject,
  write: ParticipantWrite,
): Promise<boolean> {
  if (project.role === "facilitator") return true;
  const row = await trx
    .selectFrom("project")
    .select("phase")
    .where("id", "=", project.id)
    .forShare()
    .executeTakeFirstOrThrow();
  return isProjectPhase(row.phase) && writeOpen(project.role, row.phase, write);
}
