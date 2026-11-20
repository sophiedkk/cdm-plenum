// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's side of the private-first brainstorm (EL13, ADR 0012): the count of elements
// per participant, the setting and the reveal. The reveal is final, so the setting can change
// only before it.
import type { Kysely } from "kysely";
import { m } from "@/i18n/messages";
import { REVEAL_PHASE } from "@/lib/phase-access";
import type { DB } from "../db/schema.gen.ts";
import type { Mailer } from "../mail.ts";
import { done, type ProjectResult, readProject, refused, withProject } from "../projects/access.ts";
import type { Author } from "../projects/member.ts";
import { log } from "../projects/queries.ts";
import { lookElements } from "./first-look.ts";
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
 * every element, still without authors (EL2). Refused once revealed (`board_already_revealed`)
 * and outside the discover phase (`reveal_outside_discover`, PR10); opening a round in the
 * decide phase still reveals it.
 */
export async function revealBoard(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
): Promise<ProjectResult<null>> {
  return withProject(db, userId, projectId, { project: ["update"] }, async (trx, project) => {
    if (project.phase !== REVEAL_PHASE) return refused("reveal_outside_discover");
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

/**
 * E-mails a reminder during the discover phase (facilitator only, EL13, EL22): while elements
 * from existing models wait for a first look, to every participant who has not answered them
 * all, with a link to the first look; otherwise to every participant who has not added an
 * element yet, with a link to the brainstorm. Refused without a mailer (`mail_not_configured`)
 * and outside discover (`reminder_outside_discover`). Returns how many e-mails went out; the
 * addresses never leave the server.
 */
export async function sendBrainstormReminder(
  db: Kysely<DB>,
  userId: string,
  projectId: string,
  deps: { mailer: Mailer | null; baseUrl: string },
): Promise<ProjectResult<{ sent: number }>> {
  const found = await withProject<{ name: string; emails: string[]; firstLook: boolean }>(
    db,
    userId,
    projectId,
    { project: ["update"] },
    async (trx, project) => {
      if (deps.mailer === null) return refused("mail_not_configured");
      if (project.phase !== REVEAL_PHASE) return refused("reminder_outside_discover");
      const looked = (await lookElements(trx, project.id)).map((element) => element.id);
      if (looked.length > 0) {
        const unfinished = await trx
          .selectFrom("member")
          .innerJoin("user", "user.id", "member.userId")
          .leftJoin("first_look_answer as answer", (join) =>
            join.onRef("answer.member_id", "=", "member.id").on("answer.element_id", "in", looked),
          )
          .select("user.email")
          .where("member.organizationId", "=", project.id)
          .where("member.role", "=", "participant")
          .groupBy("user.email")
          .having((eb) => eb.fn.count("answer.element_id"), "<", looked.length)
          .orderBy("user.email")
          .execute();
        await log(trx, userId, project.id, "brainstorm_reminder_sent", "project", project.id);
        return done({
          name: project.name,
          emails: unfinished.map((row) => row.email),
          firstLook: true,
        });
      }
      const rows = await trx
        .selectFrom("member")
        .innerJoin("user", "user.id", "member.userId")
        .leftJoin("element", (join) =>
          join
            .onRef("element.author_member_id", "=", "member.id")
            .on("element.project_id", "=", project.id),
        )
        .select("user.email")
        .where("member.organizationId", "=", project.id)
        .where("member.role", "=", "participant")
        .groupBy("user.email")
        .having((eb) => eb.fn.count("element.id"), "=", 0)
        .orderBy("user.email")
        .execute();
      await log(trx, userId, project.id, "brainstorm_reminder_sent", "project", project.id);
      return done({ name: project.name, emails: rows.map((row) => row.email), firstLook: false });
    },
  );
  if (!found.ok || deps.mailer === null) return found.ok ? refused("mail_not_configured") : found;
  const { name, emails, firstLook } = found.value;
  const page = firstLook ? "first-look" : "brainstorm";
  const url = new URL(`/projects/${encodeURIComponent(projectId)}/${page}`, deps.baseUrl);
  let sent = 0;
  for (const to of emails) {
    try {
      await deps.mailer.send({
        to,
        subject: firstLook
          ? m.mail_first_look_reminder_subject({ project: name })
          : m.mail_reminder_subject({ project: name }),
        text: firstLook
          ? m.mail_first_look_reminder_body({ project: name, url: url.toString() })
          : m.mail_reminder_body({ project: name, url: url.toString() }),
      });
      sent += 1;
    } catch (error) {
      const kind = error instanceof Error ? error.name : "unknown";
      console.error(`reminder_mail_failed project=${projectId} ${kind}`);
    }
  }
  return done({ sent });
}
