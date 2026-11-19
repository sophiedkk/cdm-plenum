// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The access rule of every project write (Q-SEC-1, R-01): the project role comes from a
// membership query on the session user, inside the transaction that writes, with the project
// row locked. A user without a role in the project gets `not_found`, never a hint that the
// project exists (docs/architecture.md, "Roles and access").
import type { Kysely, Transaction } from "kysely";
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
    .select(["project.id", "organization.name", "member.role"])
    .where("project.id", "=", projectId)
    .where("member.userId", "=", userId)
    .forUpdate("project")
    .executeTakeFirst();
  if (!row || !isProjectRole(row.role)) return null;
  return { id: row.id, name: row.name, role: row.role };
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
