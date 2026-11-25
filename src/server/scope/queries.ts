// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The scope statement of a project (SC1) and the comments on it (SC2). Every member reads the
// statement and comments on it; only the facilitator edits it and sees who wrote a comment.
import { type Kysely, sql, type Transaction } from "kysely";
import { isModelType, type ModelType, modelTypeOpen } from "@/lib/model-types";
import type { DB } from "../db/schema.gen.ts";
import {
  done,
  type ProjectResult,
  phaseOpenFor,
  readProject,
  refused,
  withProject,
} from "../projects/access.ts";
import {
  type Author,
  actorMemberId,
  isTeamProject,
  type TeamAuthor,
  teamAuthors,
} from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import type {
  AddScopeCommentInput,
  AddScopeSourceInput,
  ReorderScopeSourcesInput,
  RestoreScopeSourceInput,
  ScopeSourceInput,
  SetModelTypeInput,
  UpdateScopeInput,
} from "./schemas.ts";

export interface ScopeSource {
  id: string;
  label: string;
  url: string | null;
}

export interface ScopeStatement {
  concept: string;
  useCases: string;
  outOfScope: string;
  updatedAt: string;
  /** In the facilitator's order. */
  sources: ScopeSource[];
  /** Null until the facilitator chooses one (SC4). */
  modelType: ModelType | null;
}

/** The scope statement with its sources, for any member (SC1). */
export async function getScope(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<ScopeStatement>> {
  return readProject(db, userId, projectId, null, async (db, project) => {
    const statement = await db
      .selectFrom("scope_statement")
      .select(["concept", "use_cases", "out_of_scope", "updated_at"])
      .where("project_id", "=", project.id)
      .executeTakeFirst();
    const sources = await db
      .selectFrom("scope_source")
      .select(["id", "label", "url"])
      .where("project_id", "=", project.id)
      .orderBy("position")
      .execute();
    return done({
      concept: statement?.concept ?? "",
      useCases: statement?.use_cases ?? "",
      outOfScope: statement?.out_of_scope ?? "",
      updatedAt: (statement?.updated_at ?? new Date(0)).toISOString(),
      sources,
      modelType: await modelTypeOf(db, project.id),
    });
  });
}

/** Writes the concept, the use cases and what is out of scope (facilitator only, SC1). */
export async function updateScope(
  db: Kysely<DB>,
  userId: string,
  input: UpdateScopeInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { scope: ["update"] }, async (trx, project) => {
    const values = {
      concept: input.concept,
      use_cases: input.useCases,
      out_of_scope: input.outOfScope,
      updated_at: new Date(),
    };
    await trx
      .insertInto("scope_statement")
      .values({ project_id: project.id, ...values })
      .onConflict((oc) => oc.column("project_id").doUpdateSet(values))
      .execute();
    await log(trx, userId, project.id, "scope_updated", "project", project.id);
    return done(null);
  });
}

/** The model type of the project (SC4), or null before the facilitator chose one. */
export async function modelTypeOf(db: Kysely<DB>, projectId: string): Promise<ModelType | null> {
  const row = await db
    .selectFrom("project")
    .select("model_type")
    .where("id", "=", projectId)
    .executeTakeFirst();
  return isModelType(row?.model_type) ? row.model_type : null;
}

/**
 * Sets the model type of the project (facilitator only, SC4, ADR 0021): in the scope phase and
 * ahead of it in discover (PR10); refused once the elements are rated
 * (`model_type_after_discover`).
 */
export async function setModelType(
  db: Kysely<DB>,
  userId: string,
  input: SetModelTypeInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { scope: ["update"] }, async (trx, project) => {
    if (!modelTypeOpen(project.phase)) return refused("model_type_after_discover");
    await trx
      .updateTable("project")
      .set({ model_type: input.modelType })
      .where("id", "=", project.id)
      .execute();
    await log(trx, userId, project.id, "model_type_set", "project", project.id);
    return done(null);
  });
}

async function touchScope(trx: Transaction<DB>, projectId: string): Promise<void> {
  await trx
    .updateTable("scope_statement")
    .set({ updated_at: new Date() })
    .where("project_id", "=", projectId)
    .execute();
}

/** Adds a source document at the end of the list (facilitator only, SC1). */
export async function addScopeSource(
  db: Kysely<DB>,
  userId: string,
  input: AddScopeSourceInput,
): Promise<ProjectResult<{ sourceId: string }>> {
  return withProject(db, userId, input.projectId, { scope: ["update"] }, async (trx, project) => {
    const row = await trx
      .insertInto("scope_source")
      .values({
        project_id: project.id,
        label: input.label,
        url: input.url,
        position: sql<number>`(select coalesce(max(position), -1) + 1 from scope_source where project_id = ${project.id})`,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await touchScope(trx, project.id);
    await log(trx, userId, project.id, "scope_source_added", "scope_source", row.id);
    return done({ sourceId: row.id });
  });
}

/**
 * Gives the sources the positions 0, 1, 2 ... in `orderedIds`. The unique (project, position)
 * constraint is checked per row, so the rows first move to negative positions.
 */
async function writeOrder(
  trx: Transaction<DB>,
  projectId: string,
  orderedIds: string[],
): Promise<void> {
  if (orderedIds.length === 0) return;
  await trx
    .updateTable("scope_source")
    .set({ position: sql<number>`-1 - position` })
    .where("project_id", "=", projectId)
    .execute();
  for (const [position, id] of orderedIds.entries()) {
    await trx
      .updateTable("scope_source")
      .set({ position })
      .where("id", "=", id)
      .where("project_id", "=", projectId)
      .execute();
  }
}

async function sourceIds(trx: Transaction<DB>, projectId: string): Promise<string[]> {
  const rows = await trx
    .selectFrom("scope_source")
    .select("id")
    .where("project_id", "=", projectId)
    .orderBy("position")
    .execute();
  return rows.map((row) => row.id);
}

/**
 * Puts the sources in a new order (facilitator only). `sourceIds` must name every source of the
 * project exactly once (`scope_source_order_mismatch`), so two facilitators' edits never mix.
 */
export async function reorderScopeSources(
  db: Kysely<DB>,
  userId: string,
  input: ReorderScopeSourcesInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { scope: ["update"] }, async (trx, project) => {
    const current = await sourceIds(trx, project.id);
    const wanted = new Set(input.sourceIds);
    if (
      wanted.size !== input.sourceIds.length ||
      wanted.size !== current.length ||
      current.some((id) => !wanted.has(id))
    ) {
      return refused("scope_source_order_mismatch");
    }
    await writeOrder(trx, project.id, input.sourceIds);
    await touchScope(trx, project.id);
    await log(trx, userId, project.id, "scope_sources_reordered", "project", project.id);
    return done(null);
  });
}

/** Removes a source; the ones after it move up (facilitator only). */
export async function removeScopeSource(
  db: Kysely<DB>,
  userId: string,
  input: ScopeSourceInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { scope: ["update"] }, async (trx, project) => {
    const row = await trx
      .deleteFrom("scope_source")
      .where("id", "=", input.sourceId)
      .where("project_id", "=", project.id)
      .returning("id")
      .executeTakeFirst();
    if (!row) return refused("scope_source_not_found");
    await writeOrder(trx, project.id, await sourceIds(trx, project.id));
    await touchScope(trx, project.id);
    await log(trx, userId, project.id, "scope_source_removed", "scope_source", row.id);
    return done(null);
  });
}

/**
 * Undoes a removal (facilitator only): adds the source again at `position`, or at the end when
 * the list has become shorter. It gets a new id, so the log shows the removal and the restore.
 */
export async function restoreScopeSource(
  db: Kysely<DB>,
  userId: string,
  input: RestoreScopeSourceInput,
): Promise<ProjectResult<{ sourceId: string }>> {
  return withProject(db, userId, input.projectId, { scope: ["update"] }, async (trx, project) => {
    const row = await trx
      .insertInto("scope_source")
      .values({
        project_id: project.id,
        label: input.label,
        url: input.url,
        position: sql<number>`(select coalesce(max(position), -1) + 1 from scope_source where project_id = ${project.id})`,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const order = (await sourceIds(trx, project.id)).filter((id) => id !== row.id);
    order.splice(Math.min(input.position, order.length), 0, row.id);
    await writeOrder(trx, project.id, order);
    await touchScope(trx, project.id);
    await log(trx, userId, project.id, "scope_source_restored", "scope_source", row.id);
    return done({ sourceId: row.id });
  });
}

/**
 * Adds a comment on the scope statement (any member, SC2). A participant comments in the scope
 * phase only (`phase_closed`, PR9).
 */
export async function addScopeComment(
  db: Kysely<DB>,
  userId: string,
  input: AddScopeCommentInput,
): Promise<ProjectResult<{ commentId: string }>> {
  return db.transaction().execute((trx) =>
    readProject(trx, userId, input.projectId, null, async (trx, project) => {
      if (!(await phaseOpenFor(trx, project, "scope_comment"))) return refused("phase_closed");
      const authorMemberId = await actorMemberId(trx, project.id, userId);
      const row = await trx
        .insertInto("scope_comment")
        .values({ project_id: project.id, author_member_id: authorMemberId, body: input.body })
        .returning("id")
        .executeTakeFirstOrThrow();
      await log(trx, userId, project.id, "scope_comment_added", "scope_comment", row.id);
      return done({ commentId: row.id });
    }),
  );
}

export interface ScopeComment {
  id: string;
  body: string;
  createdAt: string;
  /** Whether the requester wrote it; all a participant learns about an author in a Delphi project. */
  mine: boolean;
  /** Present in a Team project only (PR14, ADR 0023). */
  author?: TeamAuthor | null;
}

export interface ScopeCommentWithAuthor extends Omit<ScopeComment, "mine"> {
  /** Null when the author left the project. */
  author: Author | null;
}

/**
 * The comments on the scope, oldest first, without authors (any member, SC2, ADR 0005). Each
 * comment says only whether the requester wrote it, decided here so no identity leaves the server.
 */
export async function listScopeComments(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<ScopeComment[]>> {
  return readProject(db, userId, projectId, null, async (db, project) => {
    const self = await actorMemberId(db, project.id, userId);
    const rows = await db
      .selectFrom("scope_comment")
      .select(["id", "body", "created_at", "author_member_id"])
      .where("project_id", "=", project.id)
      .orderBy("created_at")
      .orderBy("id")
      .execute();
    const named = await isTeamProject(db, project.id);
    const authors = named
      ? await teamAuthors(
          db,
          rows.map((row) => row.author_member_id),
        )
      : null;
    return done(
      rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: iso(row.created_at),
        mine: row.author_member_id === self,
        ...(authors && {
          author:
            row.author_member_id === null ? null : (authors.get(row.author_member_id) ?? null),
        }),
      })),
    );
  });
}

/** The comments on the scope with their authors (facilitator only, SC2). */
export async function listScopeCommentsWithAuthors(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<ScopeCommentWithAuthor[]>> {
  return readProject(db, userId, projectId, { scope: ["read_authors"] }, async (db, project) => {
    const rows = await db
      .selectFrom("scope_comment")
      .leftJoin("member", "member.id", "scope_comment.author_member_id")
      .leftJoin("user", "user.id", "member.userId")
      .select([
        "scope_comment.id",
        "scope_comment.body",
        "scope_comment.created_at",
        "member.id as memberId",
        "user.name",
        "user.email",
      ])
      .where("scope_comment.project_id", "=", project.id)
      .orderBy("scope_comment.created_at")
      .orderBy("scope_comment.id")
      .execute();
    return done(
      rows.map((row) => ({
        id: row.id,
        body: row.body,
        createdAt: iso(row.created_at),
        author:
          row.memberId === null
            ? null
            : { memberId: row.memberId, name: row.name ?? "", email: row.email ?? "" },
      })),
    );
  });
}

function iso(value: Date): string {
  return value.toISOString();
}
