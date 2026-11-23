// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The members page (PR3, PR5, PR6, Q-SEC-1, Q-ANON-1) on real PostgreSQL: the facilitator sees
// the participants by name, a participant only the number per group, and a participant leaves.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { acceptInvitationsOnSignIn } from "../invitations/acceptance.ts";
import { invite } from "../invitations/queries.ts";
import { saveRating } from "../rounds/ratings.ts";
import { roundResults } from "../rounds/results.ts";
import { closedNow, inDays, ok, openedRound, panelProject } from "../rounds/test-round.ts";
import { emailOf, groupId } from "../test-fixtures.ts";
import { personLeaks, projectWithMembers } from "../test-project-members.ts";
import {
  getProject,
  leaveProject,
  listGroupMembers,
  listGroups,
  listProjects,
  removeGroup,
} from "./queries.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

const DEPS = { baseUrl: "http://localhost:3000", mailer: null };

describe("listGroups (PR6)", () => {
  it("gives every member the groups with the number of participants and no names (Q-ANON-1)", async () => {
    const members = await projectWithMembers(db);
    const listed = await listGroups(db, members.participant, members.projectId);
    if (!listed.ok) throw new Error(listed.error);
    const nursing = listed.value.find((group) => group.name === "Nursing");
    expect(nursing).toMatchObject({ expertType: "clinical", participants: 2 });
    expect(listed.value.find((group) => group.name === "Terminology")).toMatchObject({
      expertType: "terminology",
      participants: 0,
    });
    expect(personLeaks(listed.value, members)).toEqual([]);
  });

  it("refuses a non-member with not_found (Q-SEC-1)", async () => {
    const members = await projectWithMembers(db);
    expect(await listGroups(db, members.outsider, members.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("listGroupMembers (PR3)", () => {
  it("gives the facilitator every group with its participants by name and address", async () => {
    const members = await projectWithMembers(db);
    const listed = await listGroupMembers(db, members.facilitator, members.projectId);
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.value).toHaveLength(9);
    const nursing = listed.value.find((group) => group.name === "Nursing");
    expect(nursing?.participants).toBe(2);
    // The fixture addresses carry a random suffix, so this checks the members, not their order.
    expect(nursing?.members.map((member) => member.email).sort()).toEqual(
      [emailOf(members.participant), emailOf(members.otherParticipant)].sort(),
    );
    expect(listed.value.find((group) => group.name === "Patient")?.members).toEqual([]);
  });

  it("refuses a participant (forbidden) and a non-member (not_found)", async () => {
    const members = await projectWithMembers(db);
    expect(await listGroupMembers(db, members.participant, members.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await listGroupMembers(db, members.outsider, members.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("leaveProject (PR5)", () => {
  it("takes away every access of the participant and empties their place in the group", async () => {
    const members = await projectWithMembers(db);
    const { projectId, participant } = members;
    expect(await leaveProject(db, participant, projectId)).toEqual({ ok: true, value: null });

    expect(await getProject(db, participant, projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await listProjects(db, participant)).toEqual([]);
    expect(await listGroups(db, participant, projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await leaveProject(db, participant, projectId)).toEqual({
      ok: false,
      error: "not_found",
    });

    const listed = await listGroupMembers(db, members.facilitator, projectId);
    if (!listed.ok) throw new Error(listed.error);
    const nursing = listed.value.find((group) => group.name === "Nursing");
    expect(nursing?.members.map((member) => member.email)).toEqual([
      emailOf(members.otherParticipant),
    ]);
    const team = await db
      .selectFrom("team")
      .select("memberCount")
      .where("id", "=", nursing?.id ?? "")
      .executeTakeFirstOrThrow();
    expect(team.memberCount).toBe(1);
    const logged = await db
      .selectFrom("activity_log")
      .select(["action", "actor_user_id", "target_id"])
      .where("action", "=", "member_left")
      .execute();
    expect(logged).toEqual([
      { action: "member_left", actor_user_id: participant, target_id: projectId },
    ]);
  });

  it("refuses the facilitator (forbidden) and a non-member (not_found)", async () => {
    const members = await projectWithMembers(db);
    expect(await leaveProject(db, members.facilitator, members.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await leaveProject(db, members.outsider, members.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("keeps the ratings of a closed round in its results", async () => {
    const p = await panelProject(db);
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const [element] = p.elements;
    for (const rater of [p.raters.n1, p.raters.n2]) {
      ok(
        await saveRating(db, rater, {
          projectId: p.projectId,
          roundId,
          elementId: element,
          score: 9,
        }),
      );
    }
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const before = ok(
      await roundResults(
        db,
        p.facilitator,
        { projectId: p.projectId, roundId },
        { now: inDays(2) },
      ),
    );

    expect((await leaveProject(db, p.raters.n1, p.projectId)).ok).toBe(true);

    const after = ok(
      await roundResults(
        db,
        p.facilitator,
        { projectId: p.projectId, roundId },
        { now: inDays(2) },
      ),
    );
    expect(after).toEqual(before);
    const ratings = await db
      .selectFrom("rating")
      .select("score")
      .where("round_id", "=", roundId)
      .execute();
    expect(ratings).toHaveLength(2);
  });

  it("lets a group with only a former participant be removed", async () => {
    const members = await projectWithMembers(db);
    const { projectId, facilitator } = members;
    await leaveProject(db, members.participant, projectId);
    await leaveProject(db, members.otherParticipant, projectId);
    const nursing = await groupId(db, projectId, "Nursing");
    expect(await removeGroup(db, facilitator, { projectId, groupId: nursing })).toEqual({
      ok: true,
      value: null,
    });
  });

  it("lets a former participant be invited again, with the rating code they had", async () => {
    const members = await projectWithMembers(db);
    const { projectId, facilitator, participant } = members;
    const codes = () =>
      db
        .selectFrom("rating_code")
        .innerJoin("member", "member.id", "rating_code.member_id")
        .select(["rating_code.id", "member.role"])
        .where("member.userId", "=", participant)
        .execute();
    const [before] = await codes();
    await leaveProject(db, participant, projectId);

    const terminology = await groupId(db, projectId, "Terminology");
    const invited = await invite(
      db,
      facilitator,
      { projectId, groupId: terminology, email: emailOf(participant) },
      { ...DEPS, now: new Date() },
    );
    expect(invited.ok).toBe(true);
    expect(await acceptInvitationsOnSignIn(db, participant, new Date())).toBe(1);

    expect(await codes()).toEqual([{ id: before?.id, role: "participant" }]);
    const listed = await listGroups(db, participant, projectId);
    if (!listed.ok) throw new Error(listed.error);
    expect(listed.value.find((group) => group.name === "Terminology")?.participants).toBe(1);
    expect(listed.value.find((group) => group.name === "Nursing")?.participants).toBe(1);
  });
});
