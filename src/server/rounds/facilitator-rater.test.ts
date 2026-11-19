// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A facilitator who rates as a member of one stakeholder group (DE14, owner decision 2026-11-19,
// resolves O-4) on real PostgreSQL: joining, moving and leaving the group, and their ratings
// counting like a participant's in the results, the response rate and the minimum panel.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { getProject, listGroupMembers, listGroups, setRaterGroup } from "../projects/queries.ts";
import { facilitatorWithProject, groupId } from "../test-fixtures.ts";
import { getRound, listRounds, panelStatus } from "./queries.ts";
import { myRatings, saveRating } from "./ratings.ts";
import { responseRate, roundResults } from "./results.ts";
import { closedNow, ok, openedRound, type PanelProject, panelProject } from "./test-round.ts";

let db: Kysely<DB>;
let p: PanelProject;
const now = () => ({ now: new Date() });
const DONE = { ok: true, value: null };

beforeEach(async () => {
  db = await createTestDb();
  p = await panelProject(db);
});

afterEach(async () => {
  await db.destroy();
});

async function join(groupName: string | null, userId = p.facilitator) {
  const id = groupName === null ? null : await groupId(db, p.projectId, groupName);
  return setRaterGroup(db, userId, { projectId: p.projectId, groupId: id });
}

async function memberCount(groupName: string) {
  const row = await db
    .selectFrom("team")
    .select("memberCount")
    .where("id", "=", await groupId(db, p.projectId, groupName))
    .executeTakeFirstOrThrow();
  return row.memberCount;
}

async function rateAll(userId: string, roundId: string, score: number) {
  for (const elementId of p.elements) {
    const saved = await saveRating(db, userId, {
      projectId: p.projectId,
      roundId,
      elementId,
      score,
    });
    if (!saved.ok) throw new Error(saved.error);
  }
}

describe("setRaterGroup (DE14)", () => {
  it("places the facilitator in one group, moves them and takes them out; they stay facilitator", async () => {
    expect(await join("Nursing")).toEqual({ ok: true, value: null });
    let detail = await getProject(db, p.facilitator, p.projectId);
    expect(detail.ok && detail.value).toMatchObject({
      role: "facilitator",
      ownGroupId: await groupId(db, p.projectId, "Nursing"),
    });
    expect(await memberCount("Nursing")).toBe(3);
    const listed = await listGroupMembers(db, p.facilitator, p.projectId);
    if (!listed.ok) throw new Error(listed.error);
    const nursing = listed.value.find((group) => group.name === "Nursing");
    expect(nursing?.participants).toBe(3);
    expect(nursing?.members.filter((member) => member.role === "facilitator")).toHaveLength(1);

    expect(await join("Terminology")).toEqual(DONE);
    expect(await memberCount("Nursing")).toBe(2);
    expect(await memberCount("Terminology")).toBe(2);
    const counts = await listGroups(db, p.raters.n1, p.projectId);
    if (!counts.ok) throw new Error(counts.error);
    expect(counts.value.find((group) => group.name === "Terminology")?.participants).toBe(2);

    expect(await join(null)).toEqual(DONE);
    detail = await getProject(db, p.facilitator, p.projectId);
    expect(detail.ok && detail.value).toMatchObject({ role: "facilitator", ownGroupId: null });
    expect(await memberCount("Terminology")).toBe(1);
    const actions = await db
      .selectFrom("activity_log")
      .select("action")
      .where("action", "like", "rater_group_%")
      .orderBy("id")
      .execute();
    expect(actions.map((row) => row.action)).toEqual([
      "rater_group_joined",
      "rater_group_joined",
      "rater_group_left",
    ]);
  });

  it("lets the facilitator join during an open round, but not move or leave until it closes", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    expect(await join("Nursing")).toEqual(DONE);
    for (const target of ["Terminology", null]) {
      expect(await join(target)).toEqual({ ok: false, error: "rater_group_locked" });
    }
    expect(await memberCount("Nursing")).toBe(3);
    await closedNow(db, p.facilitator, p.projectId, roundId);
    expect(await join(null)).toEqual(DONE);
  });

  it("refuses a group of another project (group_not_found)", async () => {
    const other = await facilitatorWithProject(db, "fac2");
    const foreign = await groupId(db, other.projectId, "Nursing");
    expect(
      await setRaterGroup(db, p.facilitator, { projectId: p.projectId, groupId: foreign }),
    ).toEqual({ ok: false, error: "group_not_found" });
  });

  it("refuses a participant (forbidden) and a non-member (not_found)", async () => {
    expect(await join("Terminology", p.raters.n1)).toEqual({ ok: false, error: "forbidden" });
    expect(await join("Terminology", p.outsider)).toEqual({ ok: false, error: "not_found" });
    expect(await memberCount("Terminology")).toBe(1);
  });
});

describe("a facilitator's ratings (DE14)", () => {
  it("counts in the panel, the response rate and the group result of their group", async () => {
    expect(await join("Nursing")).toEqual(DONE);
    const panel = ok(await panelStatus(db, p.facilitator, p.projectId));
    expect(panel.joined).toEqual({ clinical: 3, terminology: 1, architecture: 2 });
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const round = ok(await getRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    expect(round.snapshot?.panel).toEqual({ clinical: 3, terminology: 1, architecture: 2 });

    const rounds = ok(await listRounds(db, p.facilitator, p.projectId, now()));
    expect(rounds.map((r) => r.status)).toEqual(["open"]);
    await rateAll(p.facilitator, roundId, 9);
    await rateAll(p.raters.n1, roundId, 8);
    await rateAll(p.raters.n2, roundId, 7);
    const mine = ok(await myRatings(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    expect(mine.elements.map((element) => element.own.score)).toEqual([9, 9, 9]);

    const input = { projectId: p.projectId, roundId };
    const rate = ok(await responseRate(db, p.facilitator, input, now()));
    expect(rate.groups.find((group) => group.groupName === "Nursing")).toMatchObject({
      invited: 3,
      started: 3,
      completed: 3,
    });
    expect(rate.total).toEqual({ invited: 6, started: 3, completed: 3 });

    const stored = await db
      .selectFrom("rating")
      .select("team_id")
      .distinct()
      .where("round_id", "=", roundId)
      .execute();
    expect(stored).toEqual([{ team_id: await groupId(db, p.projectId, "Nursing") }]);

    await closedNow(db, p.facilitator, p.projectId, roundId);
    const results = ok(await roundResults(db, p.raters.n1, input, now()));
    // Nursing reaches the 3 scores a group result needs only with the facilitator (Q-PRIV-3).
    for (const element of results.elements) {
      expect(element.result.rated).toBe(3);
      expect(element.groups.map((group) => [group.groupName, group.result.median])).toEqual([
        ["Nursing", 8],
      ]);
    }
  });

  it("leaves a facilitator who joined after the round closed out of its response rate", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    await closedNow(db, p.facilitator, p.projectId, roundId);
    expect(await join("Nursing")).toEqual(DONE);
    const { closed_at: closedAt } = await db
      .selectFrom("round")
      .select("closed_at")
      .where("id", "=", roundId)
      .executeTakeFirstOrThrow();
    // closedNow closes as if two days had passed, so the join is moved to after that moment.
    await db
      .updateTable("teamMember")
      .set({ createdAt: new Date((closedAt?.getTime() ?? 0) + 1000) })
      .where("userId", "=", p.facilitator)
      .execute();
    const rate = ok(
      await responseRate(db, p.facilitator, { projectId: p.projectId, roundId }, now()),
    );
    expect(rate.groups.find((group) => group.groupName === "Nursing")?.invited).toBe(2);
  });

  it("refuses a facilitator who left their group, and keeps their earlier ratings", async () => {
    expect(await join("Nursing")).toEqual(DONE);
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    await rateAll(p.facilitator, roundId, 9);
    await closedNow(db, p.facilitator, p.projectId, roundId);
    expect(await join(null)).toEqual(DONE);
    const next = await openedRound(db, p.facilitator, p.projectId, { elementIds: [...p.elements] });
    expect(
      await saveRating(db, p.facilitator, {
        projectId: p.projectId,
        roundId: next,
        elementId: p.elements[0],
        score: 5,
      }),
    ).toEqual({ ok: false, error: "rater_group_required" });
    const kept = await db
      .selectFrom("rating")
      .select("score")
      .where("round_id", "=", roundId)
      .where("score", "=", 9)
      .execute();
    expect(kept).toHaveLength(3);
  });
});
