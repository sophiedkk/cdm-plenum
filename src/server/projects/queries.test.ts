// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Projects and stakeholder groups (PR2, PR6, Q-SEC-1) on real PostgreSQL, with a negative test
// per role: a participant may not manage groups, a non-member gets `not_found`.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_GROUPS, EXPERT_TYPES } from "@/lib/project-roles";
import { grantAppRole, revokeAppRole } from "../admin/app-roles.ts";
import { EXPERT_TYPE_KEYS } from "../db/migrations/0003_access.ts";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { acceptInvitationsOnSignIn } from "../invitations/acceptance.ts";
import { invite } from "../invitations/queries.ts";
import { facilitatorWithProject, groupId, insertUser, NOW } from "../test-fixtures.ts";
import { createGroup, createProject, listGroups, removeGroup, renameGroup } from "./queries.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

/** A project with a facilitator, a participant in "Nursing" and an outsider. */
async function setup() {
  const { userId: facilitator, projectId } = await facilitatorWithProject(db);
  const nursing = await groupId(db, projectId, "Nursing");
  const participant = await insertUser(db, "par");
  const invited = await invite(
    db,
    facilitator,
    { projectId, groupId: nursing, email: "par@example.test" },
    { baseUrl: "http://localhost:3000", mailer: null, now: new Date() },
  );
  expect(invited.ok).toBe(true);
  await acceptInvitationsOnSignIn(db, participant, new Date());
  const outsider = await insertUser(db, "out");
  return { facilitator, projectId, nursing, participant, outsider };
}

describe("createProject (PR2)", () => {
  it("creates the organization, the project, an empty scope and the creator as facilitator", async () => {
    const { userId, projectId } = await facilitatorWithProject(db);
    const org = await db
      .selectFrom("organization")
      .innerJoin("project", "project.id", "organization.id")
      .select(["organization.name", "organization.slug", "project.phase"])
      .where("organization.id", "=", projectId)
      .executeTakeFirstOrThrow();
    expect(org).toEqual({ name: "Blood pressure", slug: projectId, phase: "scope" });
    const scope = await db
      .selectFrom("scope_statement")
      .select(["concept", "use_cases", "out_of_scope"])
      .where("project_id", "=", projectId)
      .executeTakeFirstOrThrow();
    expect(scope).toEqual({ concept: "", use_cases: "", out_of_scope: "" });
    const member = await db
      .selectFrom("member")
      .leftJoin("rating_code", "rating_code.member_id", "member.id")
      .select(["member.role", "rating_code.id as code"])
      .where("member.organizationId", "=", projectId)
      .where("member.userId", "=", userId)
      .executeTakeFirstOrThrow();
    expect(member.role).toBe("facilitator");
    expect(member.code).not.toBeNull();
  });

  it("creates the default stakeholder groups with their expert types, named in the locale (PR6)", async () => {
    const userId = await insertUser(db, "nl");
    await grantAppRole(db, "nl@example.test", "facilitator");
    const created = await createProject(db, userId, { name: "Bloeddruk" }, "nl");
    if (!created.ok) throw new Error(created.error);
    const groups = await listGroups(db, userId, created.value.projectId);
    expect(groups.ok && groups.value.map((g) => [g.name, g.expertType])).toEqual([
      ["Administratief", "clinical"],
      ["Architectuur", "architecture"],
      ["Eerste lijn", "clinical"],
      ["GGZ", "clinical"],
      ["Medicatie en allergieën", "clinical"],
      ["Medisch algemeen", "clinical"],
      ["Patiënt", "clinical"],
      ["Terminologie", "terminology"],
      ["Verpleegkundig", "clinical"],
    ]);
    expect(DEFAULT_GROUPS).toHaveLength(9);
  });

  it("refuses a user without the application role facilitator", async () => {
    const userId = await insertUser(db, "plain");
    await grantAppRole(db, "plain@example.test", "administrator");
    expect(await createProject(db, userId, { name: "X" }, "en")).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await db.selectFrom("organization").select("id").execute()).toEqual([]);
  });

  it("after a revoked right refuses new projects but keeps existing ones and their memberships", async () => {
    const { userId, projectId } = await facilitatorWithProject(db);
    await revokeAppRole(db, "fac@example.test", "facilitator");
    expect(await createProject(db, userId, { name: "Second" }, "en")).toEqual({
      ok: false,
      error: "forbidden",
    });
    const member = await db
      .selectFrom("member")
      .select("role")
      .where("organizationId", "=", projectId)
      .where("userId", "=", userId)
      .executeTakeFirstOrThrow();
    expect(member.role).toBe("facilitator");
    const created = await createGroup(db, userId, {
      projectId,
      name: "Physiotherapy",
      expertType: "clinical",
    });
    expect(created.ok).toBe(true);
  });
});

describe("stakeholder groups (PR6)", () => {
  it("lets the facilitator add, rename and remove a group", async () => {
    const { facilitator, projectId } = await setup();
    const created = await createGroup(db, facilitator, {
      projectId,
      name: "Physiotherapy",
      expertType: "clinical",
    });
    if (!created.ok) throw new Error(created.error);
    const id = created.value.groupId;
    expect(
      await renameGroup(db, facilitator, { projectId, groupId: id, name: "Physical therapy" }),
    ).toEqual({ ok: true, value: null });
    expect(await removeGroup(db, facilitator, { projectId, groupId: id })).toEqual({
      ok: true,
      value: null,
    });
    const actions = await db
      .selectFrom("activity_log")
      .select("action")
      .where("target_id", "=", id)
      .orderBy("id")
      .execute();
    expect(actions.map((a) => a.action)).toEqual([
      "group_created",
      "group_renamed",
      "group_removed",
    ]);
  });

  it("refuses a name another group of the project has, ignoring case", async () => {
    const { facilitator, projectId } = await setup();
    expect(
      await createGroup(db, facilitator, { projectId, name: "nursing", expertType: "clinical" }),
    ).toEqual({ ok: false, error: "group_name_taken" });
    const patient = await groupId(db, projectId, "Patient");
    expect(
      await renameGroup(db, facilitator, { projectId, groupId: patient, name: "NURSING" }),
    ).toEqual({ ok: false, error: "group_name_taken" });
    expect(
      await renameGroup(db, facilitator, { projectId, groupId: patient, name: "patient" }),
    ).toEqual({ ok: true, value: null });
  });

  it("refuses to remove a group with a member or a pending invitation", async () => {
    const { facilitator, projectId, nursing } = await setup();
    expect(await removeGroup(db, facilitator, { projectId, groupId: nursing })).toEqual({
      ok: false,
      error: "group_not_empty",
    });
    const patient = await groupId(db, projectId, "Patient");
    await invite(
      db,
      facilitator,
      { projectId, groupId: patient, email: "new@example.test" },
      { baseUrl: "http://localhost:3000", mailer: null, now: new Date() },
    );
    expect(await removeGroup(db, facilitator, { projectId, groupId: patient })).toEqual({
      ok: false,
      error: "group_not_empty",
    });
  });

  it("refuses a group of another project", async () => {
    const { facilitator, projectId } = await setup();
    const other = await facilitatorWithProject(db, "other");
    const foreign = await groupId(db, other.projectId, "Nursing");
    expect(await renameGroup(db, facilitator, { projectId, groupId: foreign, name: "X" })).toEqual({
      ok: false,
      error: "group_not_found",
    });
    expect(await removeGroup(db, facilitator, { projectId, groupId: foreign })).toEqual({
      ok: false,
      error: "group_not_found",
    });
  });

  it("refuses a participant (forbidden) and a non-member (not_found)", async () => {
    const { participant, outsider, projectId, nursing } = await setup();
    const input = { projectId, name: "X", expertType: "clinical" } as const;
    expect(await createGroup(db, participant, input)).toEqual({ ok: false, error: "forbidden" });
    expect(await createGroup(db, outsider, input)).toEqual({ ok: false, error: "not_found" });
    const rename = { projectId, groupId: nursing, name: "X" };
    expect(await renameGroup(db, participant, rename)).toEqual({ ok: false, error: "forbidden" });
    expect(await renameGroup(db, outsider, rename)).toEqual({ ok: false, error: "not_found" });
    const remove = { projectId, groupId: nursing };
    expect(await removeGroup(db, participant, remove)).toEqual({ ok: false, error: "forbidden" });
    expect(await removeGroup(db, outsider, remove)).toEqual({ ok: false, error: "not_found" });
  });

  it("lists the groups for any member and gives a non-member not_found", async () => {
    const { participant, outsider, projectId } = await setup();
    const listed = await listGroups(db, participant, projectId);
    expect(listed.ok && listed.value).toHaveLength(9);
    expect(await listGroups(db, outsider, projectId)).toEqual({ ok: false, error: "not_found" });
    expect(await listGroups(db, outsider, "no-such-project")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("holds the expert type in the database", async () => {
    const { projectId } = await setup();
    await expect(
      db.transaction().execute((trx) =>
        trx
          .insertInto("team")
          .values({
            id: "team-x",
            organizationId: projectId,
            name: "X",
            expert_type: "billing",
            memberCount: 0,
            createdAt: NOW,
          })
          .execute(),
      ),
    ).rejects.toThrow(/team_expert_type_check/);
    expect([...EXPERT_TYPE_KEYS]).toEqual([...EXPERT_TYPES]);
  });
});
