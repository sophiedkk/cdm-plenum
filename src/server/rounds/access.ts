// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The refusals of the round actions and the role checks they share. Like every project action,
// a user without a role in the project gets `not_found`, a participant asking for a facilitator
// action `forbidden` (Q-SEC-1).
import type { Kysely, Transaction } from "kysely";
import type { RuleError } from "@/lib/consensus";
import type { Shortfall } from "@/lib/panel";
import { isProjectRole, type ProjectRole } from "@/lib/project-roles";
import type { DB } from "../db/schema.gen.ts";
import { type LockedProject, lockProject } from "../projects/access.ts";

/** Why a round action was refused; the screens map each code to a translated message. */
export const ROUND_ACTION_ERRORS = [
  "not_found",
  "forbidden",
  "round_not_found",
  "element_not_found",
  "element_not_in_round",
  "panel_locked",
  "previous_round_not_closed",
  "round_not_draft",
  "round_not_open",
  "round_not_due",
  "round_not_closed",
  "round_has_no_elements",
  "closes_at_past",
  "score_out_of_scale",
  "raters_hidden",
  "rule_invalid",
  "reason_required",
] as const;
export type RoundActionError = (typeof ROUND_ACTION_ERRORS)[number];

type PlainError = Exclude<RoundActionError, "rule_invalid" | "reason_required">;

export type RoundRefusal =
  | { ok: false; error: PlainError }
  | { ok: false; error: "rule_invalid"; rule: RuleError }
  /** DE12: the panel is below the minimum; the screen asks for a reason and tries again. */
  | { ok: false; error: "reason_required"; shortfall: Shortfall[] };

export type RoundResult<T> = { ok: true; value: T } | RoundRefusal;

export function done<T>(value: T): RoundResult<T> {
  return { ok: true, value };
}

export function refused<T>(error: PlainError): RoundResult<T> {
  return { ok: false, error };
}

/** The actor's role in the project, without a lock, or `null` for a non-member. */
export async function projectRole(
  db: Kysely<DB>,
  projectId: string,
  userId: string,
): Promise<ProjectRole | null> {
  const row = await db
    .selectFrom("member")
    .innerJoin("project", "project.id", "member.organizationId")
    .select("member.role")
    .where("member.organizationId", "=", projectId)
    .where("member.userId", "=", userId)
    .executeTakeFirst();
  return row && isProjectRole(row.role) ? row.role : null;
}

/**
 * Runs `action` in one transaction with the project row locked, for the facilitator only:
 * `not_found` for a non-member, `forbidden` for a participant.
 */
export async function asFacilitator<T>(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  action: (trx: Transaction<DB>, project: LockedProject) => Promise<RoundResult<T>>,
): Promise<RoundResult<T>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, projectId, userId);
    if (!project) return refused<T>("not_found");
    if (project.role !== "facilitator") return refused<T>("forbidden");
    return action(trx, project);
  });
}

/**
 * Runs `action` in one transaction for any member of the project, without locking the project
 * row, so participants rating at the same moment do not wait for each other.
 */
export async function asMember<T>(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  action: (trx: Transaction<DB>, role: ProjectRole) => Promise<RoundResult<T>>,
): Promise<RoundResult<T>> {
  return db.transaction().execute(async (trx) => {
    const role = await projectRole(trx, projectId, userId);
    if (!role) return refused<T>("not_found");
    return action(trx, role);
  });
}
