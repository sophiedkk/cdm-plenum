// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Closing a realistic round and its results (DE5, DE6, Q-PRIV-3) on real PostgreSQL: three
// stakeholder groups, ten raters, some "unable to rate", one rater who stopped halfway.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import {
  facilitatorWithProject,
  insertElement,
  insertUser,
  joinedParticipant,
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
    await joinedParticipant(db, facilitator, projectId, "Nursing", "n5");
    let rate = ok(await responseRate(db, facilitator, { projectId, roundId }, { now: new Date() }));
    expect(rate.total).toEqual({ invited: 11, started: 10, completed: 9 });
    const closedAt = new Date(Date.now() + 2 * 86_400_000);
    ok(await closeRound(db, facilitator, { projectId, roundId }, { now: closedAt }));
    await db
      .updateTable("member")
      .set({ createdAt: new Date(closedAt.getTime() + 1000) })
      .where("userId", "=", "user-n5")
      .execute();
    rate = ok(await responseRate(db, facilitator, { projectId, roundId }, { now: new Date() }));
    expect(rate.total.invited).toBe(10);
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
