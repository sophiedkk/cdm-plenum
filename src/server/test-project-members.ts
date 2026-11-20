// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A project with one account per role, for the role tests of Q-SEC-1 and Q-ANON-1. All data is
// invented; addresses use the reserved `.test` domain.
import type { Kysely } from "kysely";
import type { ProjectPhase } from "@/lib/project-phases";
import type { DB } from "./db/schema.gen.ts";
import { acceptInvitationsOnSignIn } from "./invitations/acceptance.ts";
import { invite } from "./invitations/queries.ts";
import { emailOf, facilitatorWithProject, groupId, insertUser, setPhase } from "./test-fixtures.ts";

export interface ProjectMembers {
  projectId: string;
  facilitator: string;
  /** Two participants, so a test can show one never sees the other as an author. */
  participant: string;
  otherParticipant: string;
  /** A user with no role in the project. */
  outsider: string;
  memberIds: string[];
}

async function addParticipant(
  db: Kysely<DB>,
  facilitator: string,
  projectId: string,
  name: string,
): Promise<string> {
  const userId = await insertUser(db, name);
  const invited = await invite(
    db,
    facilitator,
    { projectId, groupId: await groupId(db, projectId, "Nursing"), email: emailOf(userId) },
    { baseUrl: "http://localhost:3000", mailer: null, now: new Date() },
  );
  if (!invited.ok) throw new Error(`invite refused: ${invited.error}`);
  await acceptInvitationsOnSignIn(db, userId, new Date());
  return userId;
}

/** A facilitator, two participants in "Nursing" and an outsider, in the given phase. */
export async function projectWithMembers(
  db: Kysely<DB>,
  phase: ProjectPhase = "scope",
): Promise<ProjectMembers> {
  const { userId: facilitator, projectId } = await facilitatorWithProject(db);
  await setPhase(db, projectId, phase);
  const participant = await addParticipant(db, facilitator, projectId, "par");
  const otherParticipant = await addParticipant(db, facilitator, projectId, "par2");
  const outsider = await insertUser(db, "out");
  const members = await db
    .selectFrom("member")
    .select("id")
    .where("organizationId", "=", projectId)
    .execute();
  return {
    projectId,
    facilitator,
    participant,
    otherParticipant,
    outsider,
    memberIds: members.map((row) => row.id),
  };
}

/**
 * Every string inside `value` that would name a person: member ids, user ids and e-mail
 * addresses of the project. An empty list means the response is anonymous (Q-ANON-1).
 */
export function personLeaks(value: unknown, members: ProjectMembers): string[] {
  const json = JSON.stringify(value);
  const people = [
    ...members.memberIds,
    members.facilitator,
    members.participant,
    members.otherParticipant,
    "@example.test",
  ];
  const keys = ["author", "member", "user", "email"];
  const leaks = people.filter((needle) => json.includes(needle));
  for (const key of keys) {
    if (new RegExp(`"[^"]*${key}[^"]*":`, "i").test(json)) leaks.push(`key:${key}`);
  }
  return leaks;
}
