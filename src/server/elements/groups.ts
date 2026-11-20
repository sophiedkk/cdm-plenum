// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The grouping of the elements (EL18) and the participants' check of it (EL24), ADR 0020. The
// facilitator moves elements between groups, renames and adds groups and asks the group to check;
// a participant marks an element "belongs elsewhere", says what a group misses and says they are
// done. Remarks reach the facilitator as counts and texts, never with a name (EL2).
import type { Kysely } from "kysely";
import { type ElementPrompt, isElementPrompt } from "@/lib/brainstorm";
import { preparesAhead, SOURCE_PHASE, stepVisible } from "@/lib/phase-access";
import type { DB } from "../db/schema.gen.ts";
import {
  done,
  type LockedProject,
  lockProject,
  type ProjectResult,
  phaseOpenFor,
  readProject,
  refused,
  withProject,
} from "../projects/access.ts";
import { actorMemberId } from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import { inPrivateStep } from "./queries.ts";
import type {
  AddElementGroupInput,
  AddGroupMissingInput,
  ElsewhereInput,
  MoveElementInput,
  RenameElementGroupInput,
} from "./schemas.ts";

type Db = Kysely<DB>;

/** An element in a group, by name only. */
export interface GroupedElement {
  id: string;
  name: string;
}

/** A group with its elements, in the order the facilitator arranged the groups. */
export interface ElementGroup {
  id: string;
  /** The facilitator's name; null keeps the translated name of `prompt`. */
  name: string | null;
  prompt: ElementPrompt | null;
  elements: GroupedElement[];
}

export interface Grouping {
  groups: ElementGroup[];
  /** Elements without a group: "Not grouped yet". */
  ungrouped: GroupedElement[];
}

/** The project's groups with their active elements, and the elements without a group. */
export async function groupingOf(db: Db, projectId: string): Promise<Grouping> {
  const groups = await db
    .selectFrom("element_group")
    .select(["id", "name", "prompt"])
    .where("project_id", "=", projectId)
    .orderBy("position")
    .orderBy("created_at")
    .execute();
  const elements = await db
    .selectFrom("element")
    .select(["id", "name", "group_id"])
    .where("project_id", "=", projectId)
    .where("merged_into", "is", null)
    .orderBy("created_at")
    .orderBy("id")
    .execute();
  const result: ElementGroup[] = groups.map((group) => ({
    id: group.id,
    name: group.name,
    prompt: isElementPrompt(group.prompt) ? group.prompt : null,
    elements: [],
  }));
  const byId = new Map(result.map((group) => [group.id, group]));
  const ungrouped: GroupedElement[] = [];
  for (const element of elements) {
    const group = element.group_id === null ? undefined : byId.get(element.group_id);
    if (group) group.elements.push({ id: element.id, name: element.name });
    else ungrouped.push({ id: element.id, name: element.name });
  }
  return { groups: result, ungrouped };
}

/** What the participants said about the grouping, as the facilitator reads it (EL24). */
export interface GroupRemarks {
  /** How many members marked each element "belongs elsewhere", by element id. */
  elsewhere: Record<string, number>;
  /** The "something missing" texts per group id, oldest first, without names. */
  missing: Record<string, string[]>;
}

export interface GroupingBoard extends Grouping {
  /** When the facilitator asked the group to check; null before. */
  checkAskedAt: string | null;
  remarks: GroupRemarks;
  participants: number;
  /** Participants who said they are done checking. */
  checked: number;
}

async function checkAskedAt(db: Db, projectId: string): Promise<Date | null> {
  const row = await db
    .selectFrom("project")
    .select("group_check_at")
    .where("id", "=", projectId)
    .executeTakeFirstOrThrow();
  return row.group_check_at;
}

/** The facts of the check for the Overview: asked or not, and how many participants are done. */
export async function checkProgress(
  db: Db,
  projectId: string,
): Promise<{ asked: boolean; checked: number }> {
  const asked = (await checkAskedAt(db, projectId)) !== null;
  const checked = await db
    .selectFrom("group_check_done")
    .innerJoin("member", "member.id", "group_check_done.member_id")
    .select((eb) => eb.fn.countAll<string>().as("count"))
    .where("member.organizationId", "=", projectId)
    .where("member.role", "=", "participant")
    .executeTakeFirstOrThrow();
  return { asked, checked: Number(checked.count) };
}

/** The grouping with the participants' remarks (facilitator only, `forbidden` otherwise). */
export async function groupingBoard(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectResult<GroupingBoard>> {
  return readProject(db, userId, projectId, { project: ["update"] }, async (reader, project) => {
    const grouping = await groupingOf(reader, project.id);
    const elsewhere = await reader
      .selectFrom("element_elsewhere")
      .innerJoin("element", "element.id", "element_elsewhere.element_id")
      .select(["element_elsewhere.element_id"])
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("element.project_id", "=", project.id)
      .groupBy("element_elsewhere.element_id")
      .execute();
    const missing = await reader
      .selectFrom("group_missing")
      .innerJoin("element_group", "element_group.id", "group_missing.group_id")
      .select(["group_missing.group_id", "group_missing.body"])
      .where("element_group.project_id", "=", project.id)
      .orderBy("group_missing.created_at")
      .execute();
    const missingByGroup: Record<string, string[]> = {};
    for (const row of missing) {
      const list = missingByGroup[row.group_id] ?? [];
      list.push(row.body);
      missingByGroup[row.group_id] = list;
    }
    const participants = await reader
      .selectFrom("member")
      .select((eb) => eb.fn.countAll<string>().as("count"))
      .where("organizationId", "=", project.id)
      .where("role", "=", "participant")
      .executeTakeFirstOrThrow();
    const progress = await checkProgress(reader, project.id);
    return done({
      ...grouping,
      checkAskedAt: (await checkAskedAt(reader, project.id))?.toISOString() ?? null,
      remarks: {
        elsewhere: Object.fromEntries(elsewhere.map((row) => [row.element_id, Number(row.count)])),
        missing: missingByGroup,
      },
      participants: Number(participants.count),
      checked: progress.checked,
    });
  });
}

/** Refuses the facilitator's grouping once the project has moved past discover (PR10). */
function groupingClosed(project: LockedProject): boolean {
  return !preparesAhead(project.phase, SOURCE_PHASE);
}

/**
 * Moves an element to a group, or to "Not grouped yet" with a null group (facilitator only,
 * EL18). Refused after discover (`groups_after_discover`), for an element or group not in the
 * project (`element_not_found`, `element_group_not_found`).
 */
export async function moveElement(
  db: Db,
  userId: string,
  input: MoveElementInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { project: ["update"] }, async (trx, project) => {
    if (groupingClosed(project)) return refused("groups_after_discover");
    const element = await trx
      .selectFrom("element")
      .select("id")
      .where("id", "=", input.elementId)
      .where("project_id", "=", project.id)
      .where("merged_into", "is", null)
      .forUpdate()
      .executeTakeFirst();
    if (!element) return refused("element_not_found");
    if (input.groupId !== null) {
      const group = await trx
        .selectFrom("element_group")
        .select("id")
        .where("id", "=", input.groupId)
        .where("project_id", "=", project.id)
        .executeTakeFirst();
      if (!group) return refused("element_group_not_found");
    }
    await trx
      .updateTable("element")
      .set({ group_id: input.groupId })
      .where("id", "=", element.id)
      .execute();
    await log(trx, userId, project.id, "element_group_moved", "element", element.id);
    return done(null);
  });
}

/** Renames a group (facilitator only, EL18); refused after discover and for another project's group. */
export async function renameElementGroup(
  db: Db,
  userId: string,
  input: RenameElementGroupInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { project: ["update"] }, async (trx, project) => {
    if (groupingClosed(project)) return refused("groups_after_discover");
    const updated = await trx
      .updateTable("element_group")
      .set({ name: input.name })
      .where("id", "=", input.groupId)
      .where("project_id", "=", project.id)
      .executeTakeFirst();
    if (Number(updated.numUpdatedRows) === 0) return refused("element_group_not_found");
    await log(trx, userId, project.id, "element_group_renamed", "element_group", input.groupId);
    return done(null);
  });
}

/** Adds an empty group after the others (facilitator only, EL18); refused after discover. */
export async function addElementGroup(
  db: Db,
  userId: string,
  input: AddElementGroupInput,
): Promise<ProjectResult<{ groupId: string }>> {
  return withProject(db, userId, input.projectId, { project: ["update"] }, async (trx, project) => {
    if (groupingClosed(project)) return refused("groups_after_discover");
    const last = await trx
      .selectFrom("element_group")
      .select((eb) => eb.fn.max("position").as("position"))
      .where("project_id", "=", project.id)
      .executeTakeFirst();
    const row = await trx
      .insertInto("element_group")
      .values({
        project_id: project.id,
        name: input.name,
        position: Number(last?.position ?? -1) + 1,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await log(trx, userId, project.id, "element_group_added", "element_group", row.id);
    return done({ groupId: row.id });
  });
}

/**
 * Asks the participants to check the grouping (facilitator only, EL24), once; asking again keeps
 * the first date. Refused outside discover (`groups_after_discover`, or `phase_closed` before it)
 * and in the private step of the brainstorm (`group_check_before_reveal`): the check shows every
 * element to every participant.
 */
export async function askGroupCheck(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, projectId, { project: ["update"] }, async (trx, project) => {
    if (groupingClosed(project)) return refused("groups_after_discover");
    if (project.phase !== SOURCE_PHASE) return refused("phase_closed");
    if (await inPrivateStep(trx, project.id)) return refused("group_check_before_reveal");
    await trx
      .updateTable("project")
      .set({ group_check_at: new Date() })
      .where("id", "=", project.id)
      .where("group_check_at", "is", null)
      .execute();
    await log(trx, userId, project.id, "group_check_asked", "project", project.id);
    return done(null);
  });
}

/** The grouping as a participant checks it, with only their own remarks (EL24). */
export interface GroupCheck extends Grouping {
  /** The reader's own "belongs elsewhere" marks, by element id. */
  elsewhere: string[];
  /** The reader's own "something missing" texts per group id. */
  missing: Record<string, string[]>;
  /** Whether the reader said they are done checking. */
  done: boolean;
}

/**
 * The grouping for any member once the facilitator asked for the check, while the phase shows
 * the step (`phase_closed` otherwise, `group_check_not_asked` before the ask).
 */
export async function groupCheck(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectResult<GroupCheck>> {
  return readProject(db, userId, projectId, null, async (reader, project) => {
    if (!stepVisible(project.role, project.phase, "group_check")) return refused("phase_closed");
    if ((await checkAskedAt(reader, project.id)) === null) return refused("group_check_not_asked");
    // NOTE: EL13. A second guard: the check shows every element, so never in the private step.
    if (project.role !== "facilitator" && (await inPrivateStep(reader, project.id))) {
      return refused("group_check_before_reveal");
    }
    const me = await actorMemberId(reader, project.id, userId);
    const grouping = await groupingOf(reader, project.id);
    const elsewhere = await reader
      .selectFrom("element_elsewhere")
      .innerJoin("element", "element.id", "element_elsewhere.element_id")
      .select("element_elsewhere.element_id")
      .where("element.project_id", "=", project.id)
      .where("element_elsewhere.member_id", "=", me)
      .execute();
    const missing = await reader
      .selectFrom("group_missing")
      .select(["group_id", "body"])
      .where("member_id", "=", me)
      .orderBy("created_at")
      .execute();
    const missingByGroup: Record<string, string[]> = {};
    for (const row of missing) {
      const list = missingByGroup[row.group_id] ?? [];
      list.push(row.body);
      missingByGroup[row.group_id] = list;
    }
    const finished = await reader
      .selectFrom("group_check_done")
      .select("member_id")
      .where("member_id", "=", me)
      .executeTakeFirst();
    return done({
      ...grouping,
      elsewhere: elsewhere.map((row) => row.element_id),
      missing: missingByGroup,
      done: finished !== undefined,
    });
  });
}

/** Locks the project and checks a participant's remark: the phase, then the facilitator's ask. */
async function inCheck<T>(
  db: Db,
  userId: string,
  projectId: string,
  action: (trx: Db, project: LockedProject, memberId: string) => Promise<ProjectResult<T>>,
): Promise<ProjectResult<T>> {
  return db.transaction().execute(async (trx) => {
    const project = await lockProject(trx, projectId, userId);
    if (!project) return refused<T>("not_found");
    if (!(await phaseOpenFor(trx, project, "group_remark"))) return refused<T>("phase_closed");
    if ((await checkAskedAt(trx, project.id)) === null) return refused<T>("group_check_not_asked");
    if (project.role !== "facilitator" && (await inPrivateStep(trx, project.id))) {
      return refused<T>("group_check_before_reveal");
    }
    return action(trx, project, await actorMemberId(trx, project.id, userId));
  });
}

/** Marks an element "belongs elsewhere", or takes the mark back (EL24). */
export async function setElsewhere(
  db: Db,
  userId: string,
  input: ElsewhereInput,
): Promise<ProjectResult<null>> {
  return inCheck(db, userId, input.projectId, async (trx, project, memberId) => {
    const element = await trx
      .selectFrom("element")
      .select("id")
      .where("id", "=", input.elementId)
      .where("project_id", "=", project.id)
      .where("merged_into", "is", null)
      .executeTakeFirst();
    if (!element) return refused("element_not_found");
    if (input.elsewhere) {
      await trx
        .insertInto("element_elsewhere")
        .values({ element_id: element.id, member_id: memberId })
        .onConflict((oc) => oc.columns(["element_id", "member_id"]).doNothing())
        .execute();
    } else {
      await trx
        .deleteFrom("element_elsewhere")
        .where("element_id", "=", element.id)
        .where("member_id", "=", memberId)
        .execute();
    }
    return done(null);
  });
}

/** Says what a group misses (EL24); the facilitator reads it without a name. */
export async function addGroupMissing(
  db: Db,
  userId: string,
  input: AddGroupMissingInput,
): Promise<ProjectResult<null>> {
  return inCheck(db, userId, input.projectId, async (trx, project, memberId) => {
    const group = await trx
      .selectFrom("element_group")
      .select("id")
      .where("id", "=", input.groupId)
      .where("project_id", "=", project.id)
      .executeTakeFirst();
    if (!group) return refused("element_group_not_found");
    await trx
      .insertInto("group_missing")
      .values({ group_id: group.id, member_id: memberId, body: input.body })
      .execute();
    return done(null);
  });
}

/** Says the reader is done checking (EL24); saying it again changes nothing. */
export async function finishGroupCheck(
  db: Db,
  userId: string,
  projectId: string,
): Promise<ProjectResult<null>> {
  return inCheck(db, userId, projectId, async (trx, _project, memberId) => {
    await trx
      .insertInto("group_check_done")
      .values({ member_id: memberId })
      .onConflict((oc) => oc.column("member_id").doNothing())
      .execute();
    return done(null);
  });
}
