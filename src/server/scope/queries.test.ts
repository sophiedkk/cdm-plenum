// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The scope statement (SC1) and its comments (SC2) on real PostgreSQL, with a negative test per
// role (Q-SEC-1) and the anonymity of comment authors (Q-ANON-1, ADR 0005).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import {
  addScopeComment,
  addScopeSource,
  getScope,
  listScopeComments,
  listScopeCommentsWithAuthors,
  removeScopeSource,
  reorderScopeSources,
  updateScope,
} from "./queries.ts";
import { addScopeSourceInput, updateScopeInput } from "./schemas.ts";

let db: Kysely<DB>;
let m: ProjectMembers;

beforeEach(async () => {
  db = await createTestDb();
  m = await projectWithMembers(db);
});

afterEach(async () => {
  await db.destroy();
});

const scopeText = {
  concept: "Blood pressure measured in an outpatient clinic",
  useCases: "Hypertension follow-up",
  outOfScope: "Invasive arterial pressure",
};

async function addSource(label: string): Promise<string> {
  const added = await addScopeSource(db, m.facilitator, {
    projectId: m.projectId,
    label,
    url: null,
  });
  if (!added.ok) throw new Error(added.error);
  return added.value.sourceId;
}

async function logActions(): Promise<string[]> {
  const rows = await db
    .selectFrom("activity_log")
    .select("action")
    .where("project_id", "=", m.projectId)
    .orderBy("occurred_at")
    .orderBy("id")
    .execute();
  return rows.map((row) => row.action);
}

describe("scope statement (SC1)", () => {
  it("lets the facilitator write the four parts and every member read them", async () => {
    expect(await updateScope(db, m.facilitator, { projectId: m.projectId, ...scopeText })).toEqual({
      ok: true,
      value: null,
    });
    await addSource("ESH guideline 2023");
    const read = await getScope(db, m.participant, m.projectId);
    if (!read.ok) throw new Error(read.error);
    expect(read.value).toMatchObject({ ...scopeText });
    expect(read.value.sources.map((s) => s.label)).toEqual(["ESH guideline 2023"]);
    expect(await logActions()).toEqual(
      expect.arrayContaining(["scope_updated", "scope_source_added"]),
    );
  });

  it("refuses every edit by a participant with forbidden", async () => {
    const sourceId = await addSource("Guideline");
    const projectId = m.projectId;
    const by = m.participant;
    expect(await updateScope(db, by, { projectId, ...scopeText })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await addScopeSource(db, by, { projectId, label: "x", url: null })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await reorderScopeSources(db, by, { projectId, sourceIds: [sourceId] })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await removeScopeSource(db, by, { projectId, sourceId })).toEqual({
      ok: false,
      error: "forbidden",
    });
    const read = await getScope(db, m.facilitator, projectId);
    expect(read.ok && read.value.concept).toBe("");
  });

  it("gives a non-member not_found on every scope function", async () => {
    const sourceId = await addSource("Guideline");
    const projectId = m.projectId;
    const by = m.outsider;
    const notFound = { ok: false, error: "not_found" };
    expect(await getScope(db, by, projectId)).toEqual(notFound);
    expect(await updateScope(db, by, { projectId, ...scopeText })).toEqual(notFound);
    expect(await addScopeSource(db, by, { projectId, label: "x", url: null })).toEqual(notFound);
    expect(await reorderScopeSources(db, by, { projectId, sourceIds: [sourceId] })).toEqual(
      notFound,
    );
    expect(await removeScopeSource(db, by, { projectId, sourceId })).toEqual(notFound);
    expect(await addScopeComment(db, by, { projectId, body: "hi" })).toEqual(notFound);
    expect(await listScopeComments(db, by, projectId)).toEqual(notFound);
    expect(await listScopeCommentsWithAuthors(db, by, projectId)).toEqual(notFound);
  });

  it("reorders the sources when every id is named once", async () => {
    const a = await addSource("A");
    const b = await addSource("B");
    const c = await addSource("C");
    const reordered = await reorderScopeSources(db, m.facilitator, {
      projectId: m.projectId,
      sourceIds: [c, a, b],
    });
    expect(reordered.ok).toBe(true);
    const read = await getScope(db, m.participant, m.projectId);
    expect(read.ok && read.value.sources.map((s) => s.label)).toEqual(["C", "A", "B"]);
  });

  it("refuses an order that misses, repeats or adds a source", async () => {
    const a = await addSource("A");
    const b = await addSource("B");
    const other = "0190a8f0-0000-7000-8000-000000000000";
    for (const sourceIds of [[a], [a, a], [a, b, other], [a, other]]) {
      expect(
        await reorderScopeSources(db, m.facilitator, { projectId: m.projectId, sourceIds }),
      ).toEqual({ ok: false, error: "scope_source_order_mismatch" });
    }
  });

  it("removes a source and closes the gap; a second removal is scope_source_not_found", async () => {
    await addSource("A");
    const b = await addSource("B");
    await addSource("C");
    const input = { projectId: m.projectId, sourceId: b };
    expect((await removeScopeSource(db, m.facilitator, input)).ok).toBe(true);
    expect(await removeScopeSource(db, m.facilitator, input)).toEqual({
      ok: false,
      error: "scope_source_not_found",
    });
    const positions = await db
      .selectFrom("scope_source")
      .select(["label", "position"])
      .where("project_id", "=", m.projectId)
      .orderBy("position")
      .execute();
    expect(positions).toEqual([
      { label: "A", position: 0 },
      { label: "C", position: 1 },
    ]);
    expect(await addSource("D")).toBeTruthy();
  });

  it("validates the input: http(s) addresses only, a label, bounded text", () => {
    const projectId = m.projectId;
    expect(addScopeSourceInput.safeParse({ projectId, label: "x" }).success).toBe(true);
    expect(
      addScopeSourceInput.safeParse({ projectId, label: "x", url: "https://example.test/g" })
        .success,
    ).toBe(true);
    for (const url of ["javascript:alert(1)", "ftp://example.test", "not a url"]) {
      expect(addScopeSourceInput.safeParse({ projectId, label: "x", url }).success).toBe(false);
    }
    expect(addScopeSourceInput.safeParse({ projectId, label: "  " }).success).toBe(false);
    expect(
      updateScopeInput.safeParse({ projectId, ...scopeText, concept: "x".repeat(10_001) }).success,
    ).toBe(false);
  });
});

describe("scope comments (SC2)", () => {
  it("lets a participant comment; the facilitator sees the author, participants do not", async () => {
    const added = await addScopeComment(db, m.participant, {
      projectId: m.projectId,
      body: "Include home measurements?",
    });
    if (!added.ok) throw new Error(added.error);
    const forParticipant = await listScopeComments(db, m.otherParticipant, m.projectId);
    if (!forParticipant.ok) throw new Error(forParticipant.error);
    expect(forParticipant.value).toEqual([
      {
        id: added.value.commentId,
        body: "Include home measurements?",
        createdAt: expect.any(String),
        mine: false,
      },
    ]);
    expect(personLeaks(forParticipant, m)).toEqual([]);
    const forAuthor = await listScopeComments(db, m.participant, m.projectId);
    expect(forAuthor.ok && forAuthor.value.map((comment) => comment.mine)).toEqual([true]);
    expect(personLeaks(forAuthor, m)).toEqual([]);

    const forFacilitator = await listScopeCommentsWithAuthors(db, m.facilitator, m.projectId);
    if (!forFacilitator.ok) throw new Error(forFacilitator.error);
    expect(forFacilitator.value[0]?.author?.email).toBe("par@example.test");
    expect(await logActions()).toContain("scope_comment_added");
  });

  it("refuses the authored list to a participant with forbidden", async () => {
    expect(await listScopeCommentsWithAuthors(db, m.participant, m.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
  });

  it("shows a comment whose author left without an author", async () => {
    await addScopeComment(db, m.participant, { projectId: m.projectId, body: "A remark" });
    await db.deleteFrom("member").where("userId", "=", m.participant).execute();
    const list = await listScopeCommentsWithAuthors(db, m.facilitator, m.projectId);
    expect(list.ok && list.value[0]?.author).toBeNull();
  });
});
