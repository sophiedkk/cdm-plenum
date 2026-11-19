// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The scope statement of a project (SC1) and the comments on it (SC2). Every member reads the
// statement and comments on it; only the facilitator edits it and sees who wrote a comment.
import { type Kysely, sql, type Transaction } from "kysely";
import type { DB } from "../db/schema.gen.ts";
import { done, type ProjectResult, readProject, refused, withProject } from "../projects/access.ts";
import { type Author, actorMemberId } from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import type {
  AddScopeCommentInput,
  AddScopeSourceInput,
  ReorderScopeSourcesInput,
  ScopeSourceInput,
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

/** Adds a comment on the scope statement (any member, SC2). */
export async function addScopeComment(
  db: Kysely<DB>,
  userId: string,
  input: AddScopeCommentInput,
): Promise<ProjectResult<{ commentId: string }>> {
  return db.transaction().execute((trx) =>
    readProject(trx, userId, input.projectId, null, async (trx, project) => {
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
}

export interface ScopeCommentWithAuthor extends ScopeComment {
  /** Null when the author left the project. */
  author: Author | null;
}

/** The comments on the scope, oldest first, without authors (any member, SC2, ADR 0005). */
export async function listScopeComments(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<ScopeComment[]>> {
  return readProject(db, userId, projectId, null, async (db, project) => {
    const rows = await db
      .selectFrom("scope_comment")
      .select(["id", "body", "created_at"])
      .where("project_id", "=", project.id)
      .orderBy("created_at")
      .orderBy("id")
      .execute();
    return done(
      rows.map((row) => ({ id: row.id, body: row.body, createdAt: iso(row.created_at) })),
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
