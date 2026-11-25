// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Projects and their stakeholder groups (PR2, PR3, PR6, ADR 0004). A project is a better-auth
// organization plus a `project` row; a stakeholder group is a team with an expert type.
import { randomUUID } from "node:crypto";
import { type Kysely, sql, type Transaction } from "kysely";
import { m } from "@/i18n/messages";
import type { Locale } from "@/i18n/runtime";
import type { ActivityAction } from "@/lib/activity-actions";
import { isModelType, type ModelType } from "@/lib/model-types";
import { isProjectPhase, type ProjectPhase } from "@/lib/project-phases";
import {
  DEFAULT_GROUPS,
  type DefaultGroupKey,
  type ExpertType,
  isProjectRole,
  LEFT_ROLE,
  type ProjectRole,
  RATER_ROLES,
} from "@/lib/project-roles";
import { userHasAppRole } from "../admin/app-roles.ts";
import type { DB } from "../db/schema.gen.ts";
import {
  done,
  lockProject,
  type ProjectResult,
  readProject,
  refused,
  withProject,
} from "./access.ts";
import type {
  CreateGroupInput,
  CreateProjectInput,
  GroupInput,
  GroupNamesVisibleInput,
  RaterGroupInput,
  RenameGroupInput,
} from "./schemas.ts";

const GROUP_NAMES: Record<DefaultGroupKey, (locale: Locale) => string> = {
  general_medicine: (locale) => m.group_general_medicine({}, { locale }),
  primary_care: (locale) => m.group_primary_care({}, { locale }),
  mental_health_care: (locale) => m.group_mental_health_care({}, { locale }),
  nursing: (locale) => m.group_nursing({}, { locale }),
  medication_and_allergies: (locale) => m.group_medication_and_allergies({}, { locale }),
  patient: (locale) => m.group_patient({}, { locale }),
  administrative: (locale) => m.group_administrative({}, { locale }),
  terminology: (locale) => m.group_terminology({}, { locale }),
  architecture: (locale) => m.group_architecture({}, { locale }),
};

/**
 * Creates a project: the organization, the `project` row, an empty scope statement, the default
 * stakeholder groups named in `locale` (PR6), and the creator as its facilitator with a rating
 * code. Requires the application role `facilitator` (owner decision 2026-11-19).
 */
export async function createProject(
  db: Kysely<DB>,
  userId: string,
  input: CreateProjectInput,
  locale: Locale,
): Promise<ProjectResult<{ projectId: string }>> {
  return db.transaction().execute(async (trx) => {
    if (!(await userHasAppRole(trx, userId, "facilitator"))) {
      return refused<{ projectId: string }>("forbidden");
    }
    const projectId = randomUUID();
    const now = new Date();
    await trx
      .insertInto("organization")
      .values({ id: projectId, name: input.name, slug: projectId, createdAt: now })
      .execute();
    await trx.insertInto("project").values({ id: projectId }).execute();
    await trx.insertInto("scope_statement").values({ project_id: projectId }).execute();
    const memberId = randomUUID();
    await trx
      .insertInto("member")
      .values({
        id: memberId,
        organizationId: projectId,
        userId,
        role: "facilitator",
        createdAt: now,
      })
      .execute();
    await trx
      .insertInto("rating_code")
      .values({ project_id: projectId, member_id: memberId })
      .execute();
    await trx
      .insertInto("team")
      .values(
        DEFAULT_GROUPS.map((group) => ({
          id: randomUUID(),
          organizationId: projectId,
          name: GROUP_NAMES[group.key](locale),
          expert_type: group.expertType,
          memberCount: 0,
          createdAt: now,
          updatedAt: now,
        })),
      )
      .execute();
    await log(trx, userId, projectId, "project_created", "project", projectId);
    return done({ projectId });
  });
}

/** A project as the user sees it in a list or a page header: never more than their own role. */
export interface ProjectSummary {
  id: string;
  name: string;
  phase: ProjectPhase;
  role: ProjectRole;
}

/** The projects the user is a member of, by name. A role or phase the app does not know is left out. */
export async function listProjects(db: Kysely<DB>, userId: string): Promise<ProjectSummary[]> {
  const rows = await db
    .selectFrom("project")
    .innerJoin("organization", "organization.id", "project.id")
    .innerJoin("member", "member.organizationId", "project.id")
    .select(["project.id", "organization.name", "project.phase", "member.role"])
    .where("member.userId", "=", userId)
    .orderBy("organization.name")
    .orderBy("project.id")
    .execute();
  return rows.flatMap((row) =>
    isProjectRole(row.role) && isProjectPhase(row.phase)
      ? [{ id: row.id, name: row.name, phase: row.phase, role: row.role }]
      : [],
  );
}

/** One project as its page header and tabs need it. */
export interface ProjectDetail extends ProjectSummary {
  /** Whether participants see who is in each stakeholder group (PR7). */
  groupNamesVisible: boolean;
  /** The user's own stakeholder group; a facilitator has one only after joining it (DE14). */
  ownGroupId: string | null;
  /** Whether the brainstorm starts private (EL13). */
  privateBrainstorm: boolean;
  /** Whether the facilitator has revealed the board (EL13). */
  boardRevealed: boolean;
  /** The model type (SC4); the brainstorm questions and starting groups follow it (EL14). */
  modelType: ModelType | null;
}

/** The stakeholder group of `userId` in the project, or null when they are in none. */
export async function ownGroupId(
  db: Kysely<DB>,
  projectId: string,
  userId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("teamMember")
    .innerJoin("team", "team.id", "teamMember.teamId")
    .select("team.id")
    .where("team.organizationId", "=", projectId)
    .where("teamMember.userId", "=", userId)
    .orderBy("teamMember.createdAt")
    .executeTakeFirst();
  return row?.id ?? null;
}

/** One project with the user's role in it, for any member (`not_found` for anyone else). */
export async function getProject(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<ProjectDetail>> {
  return readProject(db, userId, projectId, null, async (reader, project) => {
    const row = await reader
      .selectFrom("project")
      .select([
        "phase",
        "group_names_visible",
        "private_brainstorm",
        "board_revealed_at",
        "model_type",
      ])
      .where("id", "=", project.id)
      .executeTakeFirstOrThrow();
    if (!isProjectPhase(row.phase)) return refused("not_found");
    return done({
      id: project.id,
      name: project.name,
      phase: row.phase,
      role: project.role,
      groupNamesVisible: row.group_names_visible,
      ownGroupId: await ownGroupId(reader, project.id, userId),
      privateBrainstorm: row.private_brainstorm,
      boardRevealed: row.board_revealed_at !== null,
      modelType: isModelType(row.model_type) ? row.model_type : null,
    });
  });
}

export interface StakeholderGroup {
  id: string;
  name: string;
  expertType: ExpertType;
  /** How many raters are in the group: its participants and a facilitator who joined (DE14). */
  participants: number;
}

export interface VisibleGroup extends StakeholderGroup {
  /**
   * The names of the raters in the group when the facilitator lets participants see them (PR7),
   * an empty string for a person without a name; null when the setting is off. Never an address.
   */
  names: string[] | null;
}

/**
 * The stakeholder groups of a project with the number of raters in each, for any member
 * (`not_found` for anyone else). The names come along only when the project's PR7 setting is
 * on; who wrote an element or comment, or gave a rating, is never part of this (Q-ANON-1).
 */
export async function listGroups(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<VisibleGroup[]>> {
  return readProject(db, userId, projectId, null, async (reader, project) => {
    const groups = await reader
      .selectFrom("team")
      .select(["id", "name", "expert_type"])
      .where("organizationId", "=", project.id)
      .orderBy("name")
      .orderBy("id")
      .execute();
    const { group_names_visible: visible } = await reader
      .selectFrom("project")
      .select("group_names_visible")
      .where("id", "=", project.id)
      .executeTakeFirstOrThrow();
    const raters = reader
      .selectFrom("teamMember")
      .innerJoin("team", "team.id", "teamMember.teamId")
      .innerJoin("member", (join) =>
        join
          .onRef("member.userId", "=", "teamMember.userId")
          .onRef("member.organizationId", "=", "team.organizationId"),
      )
      .where("team.organizationId", "=", project.id)
      .where("member.role", "in", RATER_ROLES);
    const counts = new Map(
      (
        await raters
          .select("team.id as groupId")
          .select((eb) => eb.fn.count<string>("member.id").as("count"))
          .groupBy("team.id")
          .execute()
      ).map((row) => [row.groupId, Number(row.count)]),
    );
    // NOTE: PR7, owner decision 2026-11-19. The names are read only when the setting is on, so
    // a response with the setting off cannot carry one.
    const names = visible
      ? await raters
          .innerJoin("user", "user.id", "member.userId")
          .select(["team.id as groupId", "user.name"])
          .orderBy("user.name")
          .orderBy("member.id")
          .execute()
      : null;
    return done(
      groups.map((group) => ({
        id: group.id,
        name: group.name,
        expertType: group.expert_type as ExpertType,
        participants: counts.get(group.id) ?? 0,
        names: names?.filter((row) => row.groupId === group.id).map((row) => row.name) ?? null,
      })),
    );
  });
}

/** A rater as the facilitator sees them in the members list (PR3, DE14). */
export interface GroupMember {
  memberId: string;
  /** The account name; empty until the person sets one. */
  name: string;
  email: string;
  /** `facilitator` for a facilitator who joined the group to rate (DE14). */
  role: ProjectRole;
}

export interface GroupWithMembers extends StakeholderGroup {
  members: GroupMember[];
}

/**
 * The stakeholder groups with their raters by name and address, for the facilitator only
 * (`forbidden` for a participant). A participant gets `listGroups`, without addresses.
 */
export async function listGroupMembers(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<GroupWithMembers[]>> {
  return readProject(db, userId, projectId, { member: ["list"] }, async (reader, project) => {
    const groups = await reader
      .selectFrom("team")
      .select(["id", "name", "expert_type"])
      .where("organizationId", "=", project.id)
      .orderBy("name")
      .orderBy("id")
      .execute();
    const rows = await reader
      .selectFrom("teamMember")
      .innerJoin("team", "team.id", "teamMember.teamId")
      .innerJoin("member", (join) =>
        join
          .onRef("member.userId", "=", "teamMember.userId")
          .onRef("member.organizationId", "=", "team.organizationId"),
      )
      .innerJoin("user", "user.id", "member.userId")
      .select([
        "team.id as groupId",
        "member.id as memberId",
        "member.role",
        "user.name",
        "user.email",
      ])
      .where("team.organizationId", "=", project.id)
      .where("member.role", "in", RATER_ROLES)
      .orderBy("user.email")
      .orderBy("member.id")
      .execute();
    return done(
      groups.map((group) => {
        const members = rows
          .filter((row) => row.groupId === group.id)
          .map((row) => ({
            memberId: row.memberId,
            name: row.name,
            email: row.email,
            role: row.role as ProjectRole,
          }));
        return {
          id: group.id,
          name: group.name,
          expertType: group.expert_type as ExpertType,
          participants: members.length,
          members,
        };
      }),
    );
  });
}

/**
 * The participant leaves the project (PR5): they lose access at once and leave their
 * stakeholder group. Their member row stays with `LEFT_ROLE`, so their rating code, their
 * ratings in closed rounds and their authorship stay. A facilitator cannot leave (`forbidden`).
 */
export async function leaveProject(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<null>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, projectId, userId);
    if (!project) return refused<null>("not_found");
    if (project.role !== "participant") return refused<null>("forbidden");
    await trx
      .updateTable("member")
      .set({ role: LEFT_ROLE })
      .where("organizationId", "=", project.id)
      .where("userId", "=", userId)
      .execute();
    const left = await trx
      .deleteFrom("teamMember")
      .where("userId", "=", userId)
      .where("teamId", "in", (eb) =>
        eb.selectFrom("team").select("id").where("organizationId", "=", project.id),
      )
      .returning(["teamId", "createdAt"])
      .execute();
    const now = new Date();
    for (const { teamId, createdAt } of left) {
      // The response rate of a round that closed before now keeps counting them (DE6).
      await trx
        .insertInto("team_member_left")
        .values({
          team_id: teamId,
          user_id: userId,
          joined_at: createdAt ?? now,
          left_at: now,
        })
        .execute();
      await trx
        .updateTable("team")
        .set((eb) => ({ memberCount: eb("memberCount", "-", 1) }))
        .where("id", "=", teamId)
        .where("memberCount", ">", 0)
        .execute();
    }
    await log(trx, userId, project.id, "member_left", "project", project.id);
    return done(null);
  });
}

/** Lets participants see who is in each stakeholder group, or not (PR7, facilitator only). */
export async function setGroupNamesVisible(
  db: Kysely<DB>,
  userId: string,
  input: GroupNamesVisibleInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { project: ["update"] }, async (trx, project) => {
    await trx
      .updateTable("project")
      .set({ group_names_visible: input.visible })
      .where("id", "=", project.id)
      .execute();
    const action = input.visible ? "group_names_shown" : "group_names_hidden";
    await log(trx, userId, project.id, action, "project", project.id);
    return done(null);
  });
}

/** Whether a round of the project is open: opened and not yet closed. */
async function roundRunning(trx: Kysely<DB>, projectId: string): Promise<boolean> {
  const row = await trx
    .selectFrom("round")
    .select("id")
    .where("project_id", "=", projectId)
    .where("opened_at", "is not", null)
    .where("closed_at", "is", null)
    .executeTakeFirst();
  return row !== undefined;
}

/**
 * Places the facilitator in one stakeholder group as a rater, moves them to another, or takes
 * them out with a null group (DE14). They stay facilitator. While a round is open they can join
 * a group but not move or leave (`rater_group_locked`).
 */
export async function setRaterGroup(
  db: Kysely<DB>,
  userId: string,
  input: RaterGroupInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { group: ["join"] }, async (trx, project) => {
    if (input.groupId !== null) {
      const team = await trx
        .selectFrom("team")
        .select("id")
        .where("id", "=", input.groupId)
        .where("organizationId", "=", project.id)
        .executeTakeFirst();
      if (!team) return refused("group_not_found");
    }
    const current = await ownGroupId(trx, project.id, userId);
    if (current === input.groupId) return done(null);
    // NOTE: our own design, no requirement sets it. A rating keeps the group it was saved in,
    // so moving during an open round would split one rater over two group results.
    if (current !== null && (await roundRunning(trx, project.id))) {
      return refused("rater_group_locked");
    }
    const left = await trx
      .deleteFrom("teamMember")
      .where("userId", "=", userId)
      .where("teamId", "in", (eb) =>
        eb.selectFrom("team").select("id").where("organizationId", "=", project.id),
      )
      .returning(["teamId", "createdAt"])
      .execute();
    const now = new Date();
    for (const { teamId, createdAt } of left) {
      // The response rate of a round that closed before now keeps counting them (DE6).
      await trx
        .insertInto("team_member_left")
        .values({
          team_id: teamId,
          user_id: userId,
          joined_at: createdAt ?? now,
          left_at: now,
        })
        .execute();
      await trx
        .updateTable("team")
        .set((eb) => ({ memberCount: eb("memberCount", "-", 1) }))
        .where("id", "=", teamId)
        .where("memberCount", ">", 0)
        .execute();
    }
    if (input.groupId === null) {
      await log(trx, userId, project.id, "rater_group_left", "project", project.id);
      return done(null);
    }
    await trx
      .insertInto("teamMember")
      .values({ id: randomUUID(), teamId: input.groupId, userId, createdAt: new Date() })
      .execute();
    await trx
      .updateTable("team")
      .set((eb) => ({ memberCount: eb("memberCount", "+", 1) }))
      .where("id", "=", input.groupId)
      .execute();
    await log(trx, userId, project.id, "rater_group_joined", "group", input.groupId);
    return done(null);
  });
}

async function nameTaken(
  trx: Kysely<DB>,
  projectId: string,
  name: string,
  exceptId?: string,
): Promise<boolean> {
  let query = trx
    .selectFrom("team")
    .select("id")
    .where("organizationId", "=", projectId)
    .where(sql<string>`lower(name)`, "=", name.toLowerCase());
  if (exceptId !== undefined) query = query.where("id", "<>", exceptId);
  return (await query.executeTakeFirst()) !== undefined;
}

/** Adds a stakeholder group (facilitator only). Names are unique per project, ignoring case. */
export async function createGroup(
  db: Kysely<DB>,
  userId: string,
  input: CreateGroupInput,
): Promise<ProjectResult<{ groupId: string }>> {
  return withProject(db, userId, input.projectId, { group: ["create"] }, async (trx, project) => {
    if (await nameTaken(trx, project.id, input.name)) return refused("group_name_taken");
    const groupId = randomUUID();
    const now = new Date();
    await trx
      .insertInto("team")
      .values({
        id: groupId,
        organizationId: project.id,
        name: input.name,
        expert_type: input.expertType,
        memberCount: 0,
        createdAt: now,
        updatedAt: now,
      })
      .execute();
    await log(trx, userId, project.id, "group_created", "group", groupId);
    return done({ groupId });
  });
}

/** Renames a stakeholder group (facilitator only). */
export async function renameGroup(
  db: Kysely<DB>,
  userId: string,
  input: RenameGroupInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { group: ["update"] }, async (trx, project) => {
    if (await nameTaken(trx, project.id, input.name, input.groupId)) {
      return refused("group_name_taken");
    }
    const row = await trx
      .updateTable("team")
      .set({ name: input.name, updatedAt: new Date() })
      .where("id", "=", input.groupId)
      .where("organizationId", "=", project.id)
      .returning("id")
      .executeTakeFirst();
    if (!row) return refused("group_not_found");
    await log(trx, userId, project.id, "group_renamed", "group", input.groupId);
    return done(null);
  });
}

/**
 * Removes a stakeholder group (facilitator only). A group with members or a pending invitation
 * stays (`group_not_empty`): every participant belongs to exactly one group (PR3).
 */
export async function removeGroup(
  db: Kysely<DB>,
  userId: string,
  input: GroupInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { group: ["delete"] }, async (trx, project) => {
    const team = await trx
      .selectFrom("team")
      .select("id")
      .where("id", "=", input.groupId)
      .where("organizationId", "=", project.id)
      .forUpdate()
      .executeTakeFirst();
    if (!team) return refused("group_not_found");
    const member = await trx
      .selectFrom("teamMember")
      .select("id")
      .where("teamId", "=", team.id)
      .executeTakeFirst();
    const invitation = await trx
      .selectFrom("invitation")
      .select("id")
      .where("teamId", "=", team.id)
      .where("status", "=", "pending")
      .executeTakeFirst();
    if (member || invitation) return refused("group_not_empty");
    await trx.deleteFrom("team").where("id", "=", team.id).execute();
    await log(trx, userId, project.id, "group_removed", "group", team.id);
    return done(null);
  });
}

/** Writes an activity log row: ids only, never a name or an address (Q-PRIV-2). */
export async function log(
  trx: Kysely<DB> | Transaction<DB>,
  actorUserId: string,
  projectId: string,
  action: ActivityAction,
  targetType: string,
  targetId: string,
): Promise<void> {
  await trx
    .insertInto("activity_log")
    .values({
      actor_user_id: actorUserId,
      project_id: projectId,
      action,
      target_type: targetType,
      target_id: targetId,
    })
    .execute();
}
