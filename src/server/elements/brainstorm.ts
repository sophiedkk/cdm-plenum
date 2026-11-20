// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's side of the private-first brainstorm (EL13, ADR 0012): the count of elements
// per participant, the setting and the reveal. The reveal is final, so the setting can change
// only before it.
import type { Kysely } from "kysely";
import type { DB } from "../db/schema.gen.ts";
import { done, type ProjectResult, readProject, refused, withProject } from "../projects/access.ts";
import type { Author } from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import type { PrivateBrainstormInput } from "./schemas.ts";

export interface ParticipantCount extends Author {
  /** The participant's elements on the board, merged duplicates not counted. */
  elements: number;
}

export interface BrainstormStatus {
  privateBrainstorm: boolean;
  /** When the facilitator revealed the board; null before. */
  revealedAt: string | null;
  /** Every participant of the project with the number of elements they added, by address. */
  participants: ParticipantCount[];
}

/** The private step as the facilitator follows it (facilitator only, EL13). */
export async function brainstormStatus(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<BrainstormStatus>> {
  return readProject(db, userId, projectId, { element: ["read_authors"] }, async (db, project) => {
    const row = await db
      .selectFrom("project")
      .select(["private_brainstorm", "board_revealed_at"])
      .where("id", "=", project.id)
      .executeTakeFirstOrThrow();
    const participants = await db
      .selectFrom("member")
      .innerJoin("user", "user.id", "member.userId")
      .leftJoin("element", (join) =>
        join
          .onRef("element.author_member_id", "=", "member.id")
          .on("element.project_id", "=", project.id)
          .on("element.merged_into", "is", null),
      )
      .select(["member.id", "user.name", "user.email"])
      .select((eb) => eb.fn.count<string>("element.id").as("elements"))
      .where("member.organizationId", "=", project.id)
      .where("member.role", "=", "participant")
      .groupBy(["member.id", "user.name", "user.email"])
      .orderBy("user.email")
      .orderBy("member.id")
      .execute();
    return done({
      privateBrainstorm: row.private_brainstorm,
      revealedAt: row.board_revealed_at?.toISOString() ?? null,
      participants: participants.map((participant) => ({
        memberId: participant.id,
        name: participant.name,
        email: participant.email,
        elements: Number(participant.elements),
      })),
    });
  });
}

/**
 * Reveals the board to every participant (facilitator only, EL13): from now on everyone sees
 * every element, still without authors (EL2). Refused once revealed (`board_already_revealed`).
 */
export async function revealBoard(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, projectId, { project: ["update"] }, async (trx, project) => {
    const row = await trx
      .selectFrom("project")
      .select("board_revealed_at")
      .where("id", "=", project.id)
      .executeTakeFirstOrThrow();
    if (row.board_revealed_at !== null) return refused("board_already_revealed");
    await trx
      .updateTable("project")
      .set({ board_revealed_at: new Date() })
      .where("id", "=", project.id)
      .execute();
    await log(trx, userId, project.id, "board_revealed", "project", project.id);
    return done(null);
  });
}

/**
 * Turns the private step on or off (facilitator only, EL13). Refused after the reveal
 * (`board_already_revealed`): participants have seen the board, so hiding it again means nothing.
 */
export async function setPrivateBrainstorm(
  db: Kysely<DB>,
  userId: string,
  input: PrivateBrainstormInput,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, input.projectId, { project: ["update"] }, async (trx, project) => {
    const row = await trx
      .selectFrom("project")
      .select("board_revealed_at")
      .where("id", "=", project.id)
      .executeTakeFirstOrThrow();
    if (row.board_revealed_at !== null) return refused("board_already_revealed");
    await trx
      .updateTable("project")
      .set({ private_brainstorm: input.enabled })
      .where("id", "=", project.id)
      .execute();
    const action = input.enabled ? "private_brainstorm_on" : "private_brainstorm_off";
    await log(trx, userId, project.id, action, "project", project.id);
    return done(null);
  });
}
