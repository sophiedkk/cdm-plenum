// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Closing a realistic round and its results (DE5, DE6, Q-PRIV-3) on real PostgreSQL: three
// stakeholder groups, ten raters, some "unable to rate", one rater who stopped halfway.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { leaveProject } from "../projects/queries.ts";
import {
  facilitatorWithProject,
  insertElement,
  insertUser,
  joinedParticipant,
  setPhase,
} from "../test-fixtures.ts";
import { closeRound, createRound, setChangeClass } from "./queries.ts";
import { saveRating } from "./ratings.ts";
import { responseRate, roundResults } from "./results.ts";
import { inDays, ok, openedRound } from "./test-round.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

const RATERS = {
  Nursing: ["n1", "n2", "n3", "n4"],
  "General medicine": ["g1", "g2", "g3"],
  Terminology: ["t1", "t2", "t3"],
} as const;

// Per element, the score of each rater in the order of RATERS; null is "unable to rate",
// undefined is no answer. g3 answers only the first element.
const SCORES: Record<string, (number | null | undefined)[]> = {
  "Systolic pressure": [9, 8, 7, 7, 8, 9, null, 7, 7, 3],
  "Body position": [1, 2, 3, 1, 2, 1, undefined, null, null, 9],
  "Cuff size": [9, 9, 1, 1, 5, 5, undefined, 9, 1, 5],
  "Device serial number": [null, null, null, null, null, null, undefined, null, null, null],
  "Measurement location": [9, 9, 8, 7, 7, 5, undefined, 7, 4, 1],
};

async function realisticRound() {
  const { userId: facilitator, projectId } = await facilitatorWithProject(db);
  // A round opens in the decide phase only (PR10).
  await setPhase(db, projectId, "decide");
  await setChangeClass(db, facilitator, { projectId, changeClass: "B" });
  const raters: string[] = [];
  for (const [group, names] of Object.entries(RATERS)) {
    for (const name of names) {
      raters.push(await joinedParticipant(db, facilitator, projectId, group, name));
    }
  }
  const elements = new Map<string, string>();
  for (const name of Object.keys(SCORES)) {
    elements.set(name, await insertElement(db, projectId, name));
  }
  // Class B wants an architect; this panel has none, so it opens with a reason (DE12).
  const roundId = await openedRound(db, facilitator, projectId, {}, "No architect available");
  for (const [name, scores] of Object.entries(SCORES)) {
    for (const [index, score] of scores.entries()) {
      if (score === undefined) continue;
      ok(
        await saveRating(db, raters[index] ?? "", {
          projectId,
          roundId,
          elementId: elements.get(name) ?? "",
          score,
        }),
      );
    }
  }
  return { facilitator, projectId, roundId, raters, elements };
}

describe("closing a realistic round (DE5)", () => {
  it("writes each element's outcome under the rule in one step", async () => {
    const { facilitator, projectId, roundId, elements } = await realisticRound();
    const counts = ok(
      await closeRound(db, facilitator, { projectId, roundId }, { now: inDays(2) }),
    );
    expect(counts).toEqual({ included: 1, excluded: 1, no_consensus: 3 });
    const rows = await db
      .selectFrom("round_element")
      .select(["element_id", "outcome"])
      .where("round_id", "=", roundId)
      .execute();
    const outcome = new Map(rows.map((row) => [row.element_id, row.outcome]));
    expect(Object.keys(SCORES).map((name) => outcome.get(elements.get(name) ?? ""))).toEqual([
      "included",
      "excluded",
      "no_consensus",
      "no_consensus",
      "no_consensus",
    ]);
  });

  it("shows every member the distribution, median, outcome and groups of 3 or more (Q-PRIV-3)", async () => {
    const { facilitator, projectId, roundId, raters } = await realisticRound();
    ok(await closeRound(db, facilitator, { projectId, roundId }, { now: inDays(2) }));
    const results = ok(
      await roundResults(db, raters[0] ?? "", { projectId, roundId }, { now: new Date() }),
    );
    expect(results.round.status).toBe("closed");
    const [systolic, position, cuff, serial, location] = results.elements;
    expect(systolic).toMatchObject({
      name: "Systolic pressure",
      outcome: "included",
      result: { responses: 10, rated: 9, unableToRate: 1, median: 7, outcome: "included" },
    });
    expect(systolic?.result.distribution.map((d) => d.count)).toEqual([0, 0, 1, 0, 0, 0, 4, 2, 2]);
    // General medicine has only two scores here, so it counts in the overall result only.
    expect(systolic?.groups.map((g) => [g.groupName, g.result.rated])).toEqual([
      ["Nursing", 4],
      ["Terminology", 3],
    ]);
    expect(position?.outcome).toBe("excluded");
    expect(position?.result).toMatchObject({ responses: 9, rated: 7, unableToRate: 2 });
    expect(position?.groups.map((g) => g.groupName)).toEqual(["Nursing"]);
    expect(cuff?.outcome).toBe("no_consensus");
    expect(serial?.result).toMatchObject({ responses: 9, rated: 0, median: null });
    expect(serial?.groups).toEqual([]);
    // 6 of 9 in the top band is 66.7%, just under the 70% of the rule.
    expect(location?.result.topPct).toBeCloseTo(66.67, 2);
    expect(location?.outcome).toBe("no_consensus");
    const forFacilitator = ok(
      await roundResults(db, facilitator, { projectId, roundId }, { now: new Date() }),
    );
    expect(forFacilitator.elements).toEqual(results.elements);
  });

  it("shows the response rate per stakeholder group (DE6)", async () => {
    const { facilitator, projectId, roundId } = await realisticRound();
    const rate = ok(
      await responseRate(db, facilitator, { projectId, roundId }, { now: new Date() }),
    );
    const shown = rate.groups
      .filter((g) => g.invited > 0 || g.started > 0)
      .map((g) => [g.groupName, g.expertType, g.invited, g.started, g.completed]);
    expect(shown).toEqual([
      ["General medicine", "clinical", 3, 3, 2],
      ["Nursing", "clinical", 4, 4, 4],
      ["Terminology", "terminology", 3, 3, 3],
    ]);
    expect(rate.groups).toHaveLength(9);
    expect(rate.total).toEqual({ invited: 10, started: 10, completed: 9 });
  });

  it("counts a participant who has not started, and leaves out one who joined after closing", async () => {
    const { facilitator, projectId, roundId } = await realisticRound();
    const n5 = await joinedParticipant(db, facilitator, projectId, "Nursing", "n5");
    let rate = ok(await responseRate(db, facilitator, { projectId, roundId }, { now: new Date() }));
    expect(rate.total).toEqual({ invited: 11, started: 10, completed: 9 });
    const closedAt = new Date(Date.now() + 2 * 86_400_000);
    ok(await closeRound(db, facilitator, { projectId, roundId }, { now: closedAt }));
    await db
      .updateTable("member")
      .set({ createdAt: new Date(closedAt.getTime() + 1000) })
      .where("userId", "=", n5)
      .execute();
    rate = ok(await responseRate(db, facilitator, { projectId, roundId }, { now: new Date() }));
    expect(rate.total.invited).toBe(10);
  });
});

describe("a participant who leaves (PR5, DE6, R-04)", () => {
  // The clock of the closing is a test date two days ahead, so the leave is dated after it.
  async function leaves(user: string, projectId: string, after: Date) {
    expect((await leaveProject(db, user, projectId)).ok).toBe(true);
    await db
      .updateTable("team_member_left")
      .set({ left_at: after })
      .where("user_id", "=", user)
      .execute();
  }

  it("keeps the rate of a closed round the same after a participant leaves", async () => {
    const { facilitator, projectId, roundId, raters } = await realisticRound();
    const closedAt = new Date(Date.now() + 2 * 86_400_000);
    ok(await closeRound(db, facilitator, { projectId, roundId }, { now: closedAt }));
    const before = ok(
      await responseRate(db, facilitator, { projectId, roundId }, { now: closedAt }),
    );
    // g3 stopped halfway and n1 finished; both leave after the close.
    await leaves(raters[0] ?? "", projectId, new Date(closedAt.getTime() + 1000));
    await leaves(raters[6] ?? "", projectId, new Date(closedAt.getTime() + 1000));
    const after = ok(
      await responseRate(
        db,
        facilitator,
        { projectId, roundId },
        { now: new Date(closedAt.getTime() + 5000) },
      ),
    );
    expect(after).toEqual(before);
    expect(after.total).toEqual({ invited: 10, started: 10, completed: 9 });
  });

  it("counts only current participants in an open round", async () => {
    const { facilitator, projectId, roundId, raters } = await realisticRound();
    const now = new Date(Date.now() + 1000);
    await leaves(raters[0] ?? "", projectId, new Date(now.getTime() - 500));
    const rate = ok(await responseRate(db, facilitator, { projectId, roundId }, { now }));
    expect(rate.total.invited).toBe(9);
  });

  it("does not count someone who left before the round closed", async () => {
    const { facilitator, projectId, roundId, raters } = await realisticRound();
    const closedAt = new Date(Date.now() + 2 * 86_400_000);
    await leaves(raters[7] ?? "", projectId, new Date(closedAt.getTime() - 1000));
    ok(await closeRound(db, facilitator, { projectId, roundId }, { now: closedAt }));
    const rate = ok(await responseRate(db, facilitator, { projectId, roundId }, { now: closedAt }));
    expect(rate.total.invited).toBe(9);
  });
});

describe("refusals of results and response rate", () => {
  it("refuses results before the round closes", async () => {
    const { facilitator, projectId, roundId, raters } = await realisticRound();
    for (const user of [facilitator, raters[0] ?? ""]) {
      expect(await roundResults(db, user, { projectId, roundId }, { now: new Date() })).toEqual({
        ok: false,
        error: "round_not_closed",
      });
    }
  });

  it("refuses a draft: results to a participant, the response rate to the facilitator", async () => {
    const { userId: facilitator, projectId } = await facilitatorWithProject(db);
    const participant = await joinedParticipant(db, facilitator, projectId, "Nursing", "n1");
    await insertElement(db, projectId, "Heart rate");
    const { roundId } = ok(
      await createRound(db, facilitator, { projectId, closesAt: inDays(1) }, { now: new Date() }),
    );
    const input = { projectId, roundId };
    expect(await roundResults(db, participant, input, { now: new Date() })).toEqual({
      ok: false,
      error: "round_not_found",
    });
    expect(await roundResults(db, facilitator, input, { now: new Date() })).toEqual({
      ok: false,
      error: "round_not_closed",
    });
    expect(await responseRate(db, facilitator, input, { now: new Date() })).toEqual({
      ok: false,
      error: "round_not_open",
    });
    expect(
      await responseRate(
        db,
        facilitator,
        { projectId, roundId: "00000000-0000-4000-8000-000000000000" },
        { now: new Date() },
      ),
    ).toEqual({ ok: false, error: "round_not_found" });
  });

  it("refuses the response rate to a participant and both to a non-member", async () => {
    const { facilitator, projectId, roundId, raters } = await realisticRound();
    ok(await closeRound(db, facilitator, { projectId, roundId }, { now: inDays(2) }));
    const outsider = await insertUser(db, "out");
    const input = { projectId, roundId };
    expect(await responseRate(db, raters[0] ?? "", input, { now: new Date() })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await responseRate(db, outsider, input, { now: new Date() })).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await roundResults(db, outsider, input, { now: new Date() })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("results in groups (DE19)", () => {
  it("lists the elements under their groups in the facilitator's order, the same for everyone", async () => {
    const { facilitator, projectId, roundId, raters, elements } = await realisticRound();
    const groups = await db
      .selectFrom("element_group")
      .select(["id", "prompt", "position"])
      .where("project_id", "=", projectId)
      .where("prompt", "in", ["recorded", "method"])
      .orderBy("position")
      .execute();
    const groupOf = (prompt: string) => groups.find((group) => group.prompt === prompt)?.id ?? null;
    const place = async (name: string, prompt: string) =>
      db
        .updateTable("element")
        .set({ group_id: groupOf(prompt) })
        .where("id", "=", elements.get(name) ?? "")
        .execute();
    await place("Cuff size", "method");
    await place("Measurement location", "recorded");
    await place("Systolic pressure", "recorded");
    ok(await closeRound(db, facilitator, { projectId, roundId }, { now: inDays(2) }));

    // Each group's elements in the round's order, the groups by position, the ungrouped last.
    const recorded = ["Systolic pressure", "Measurement location"];
    const byGroup: Record<string, string[]> = { recorded, method: ["Cuff size"] };
    const expected = [
      ...groups.flatMap((group) => byGroup[group.prompt ?? ""] ?? []),
      "Body position",
      "Device serial number",
    ];
    for (const reader of [facilitator, raters[0] ?? "", raters[5] ?? ""]) {
      const results = ok(
        await roundResults(db, reader, { projectId, roundId }, { now: new Date() }),
      );
      expect(results.elements.map((element) => element.name)).toEqual(expected);
      expect(results.elements.map((element) => element.group?.prompt ?? null)).toEqual(
        expected.map((name) =>
          name === "Cuff size" ? "method" : recorded.includes(name) ? "recorded" : null,
        ),
      );
    }
  });
});
