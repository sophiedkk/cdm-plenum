// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Detail flags (DE17) on real PostgreSQL: a rater sets, changes and removes a flag per detail
// while the round is open; the facilitator sees counts and reasons without names unless the
// round shows the raters (DE4); a negative test per refusal and per role.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { setRaterGroup } from "../projects/queries.ts";
import { groupId } from "../test-fixtures.ts";
import { removeDetailFlag, roundFlags, saveDetailFlag } from "./flags.ts";
import { createRound } from "./queries.ts";
import { myRatings, ratingsByParticipant } from "./ratings.ts";
import type { DetailFlagKind } from "./schemas.ts";
import {
  closedNow,
  DAY,
  inDays,
  ok,
  openedRound,
  type PanelProject,
  panelProject,
} from "./test-round.ts";

let db: Kysely<DB>;
let p: PanelProject;
const now = () => ({ now: new Date() });

beforeEach(async () => {
  db = await createTestDb();
  p = await panelProject(db);
  for (const [name, userId] of Object.entries(p.raters)) {
    await db
      .updateTable("user")
      .set({ name: `Invented Rater ${name}` })
      .where("id", "=", userId)
      .execute();
  }
});

afterEach(async () => {
  await db.destroy();
});

function flag(
  userId: string,
  roundId: string,
  elementId: string,
  kind: DetailFlagKind,
  reason: string,
) {
  return saveDetailFlag(db, userId, { projectId: p.projectId, roundId, elementId, kind, reason });
}

function unflag(userId: string, roundId: string, elementId: string, kind: DetailFlagKind) {
  return removeDetailFlag(db, userId, { projectId: p.projectId, roundId, elementId, kind });
}

async function ownFlagsOf(userId: string, roundId: string, elementId: string) {
  const mine = ok(await myRatings(db, userId, { projectId: p.projectId, roundId }, now()));
  return mine.elements.find((element) => element.id === elementId)?.flags;
}

describe("saveDetailFlag and removeDetailFlag (DE17)", () => {
  it("sets, changes and removes one flag per detail, each rater their own", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const [first] = p.elements;
    ok(await flag(p.raters.n1, roundId, first, "data_type", " Should be a quantity "));
    ok(await flag(p.raters.n1, roundId, first, "values", "Missing the unit"));
    expect(await ownFlagsOf(p.raters.n1, roundId, first)).toEqual([
      { kind: "data_type", reason: "Should be a quantity" },
      { kind: "values", reason: "Missing the unit" },
    ]);
    ok(await flag(p.raters.n1, roundId, first, "data_type", "A count, not a quantity"));
    expect(await ownFlagsOf(p.raters.n1, roundId, first)).toEqual([
      { kind: "data_type", reason: "A count, not a quantity" },
      { kind: "values", reason: "Missing the unit" },
    ]);
    ok(await unflag(p.raters.n1, roundId, first, "values"));
    expect(await ownFlagsOf(p.raters.n1, roundId, first)).toEqual([
      { kind: "data_type", reason: "A count, not a quantity" },
    ]);
    // Removing a flag that is not there changes nothing and is no error.
    ok(await unflag(p.raters.n1, roundId, first, "values"));
    // Another rater sees none of these flags.
    expect(await ownFlagsOf(p.raters.n2, roundId, first)).toEqual([]);
    const rows = await db.selectFrom("detail_flag").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "element_id",
      "id",
      "kind",
      "rating_code_id",
      "reason",
      "round_id",
      "updated_at",
    ]);
  });

  it("refuses a flag and a removal once the round is closed", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await flag(p.raters.n1, roundId, p.elements[0], "cardinality", "Can repeat"));
    await closedNow(db, p.facilitator, p.projectId, roundId);
    expect(await flag(p.raters.n1, roundId, p.elements[0], "cardinality", "Changed")).toEqual({
      ok: false,
      error: "round_not_open",
    });
    expect(await unflag(p.raters.n1, roundId, p.elements[0], "cardinality")).toEqual({
      ok: false,
      error: "round_not_open",
    });
    expect(await db.selectFrom("detail_flag").select("reason").execute()).toEqual([
      { reason: "Can repeat" },
    ]);
  });

  it("refuses a flag once the closing date has passed, through the database trigger", async () => {
    // An open round past its closing date, inserted directly: the service never opens one.
    const { id: roundId } = await db
      .insertInto("round")
      .values({
        project_id: p.projectId,
        number: 1,
        closes_at: new Date(Date.now() - DAY),
        opened_at: new Date(Date.now() - 2 * DAY),
        panel_clinical: 2,
        minimum_clinical: 2,
        panel_terminology: 1,
        minimum_terminology: 1,
        panel_architecture: 2,
        minimum_architecture: 2,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("round_element")
      .values({ round_id: roundId, element_id: p.elements[0] })
      .execute();
    expect(await flag(p.raters.n1, roundId, p.elements[0], "values", "Wrong")).toEqual({
      ok: false,
      error: "round_not_open",
    });
    expect(await unflag(p.raters.n1, roundId, p.elements[0], "values")).toEqual({
      ok: false,
      error: "round_not_open",
    });
  });

  it("refuses an element outside the round, an unknown round and a draft", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId, {
      elementIds: [p.elements[0]],
    });
    expect(await flag(p.raters.n1, roundId, p.elements[1], "values", "Wrong")).toEqual({
      ok: false,
      error: "element_not_in_round",
    });
    expect(await unflag(p.raters.n1, roundId, p.elements[1], "values")).toEqual({
      ok: false,
      error: "element_not_in_round",
    });
    expect(
      await flag(
        p.raters.n1,
        "00000000-0000-4000-8000-000000000000",
        p.elements[0],
        "values",
        "Wrong",
      ),
    ).toEqual({ ok: false, error: "round_not_found" });
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const draft = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(1) }, now()),
    );
    expect(await flag(p.raters.n1, draft.roundId, p.elements[0], "values", "Wrong")).toEqual({
      ok: false,
      error: "round_not_found",
    });
  });

  it("refuses a non-member (not_found) and a facilitator without a group (DE14)", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    expect(await flag(p.outsider, roundId, p.elements[0], "values", "Wrong")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await unflag(p.outsider, roundId, p.elements[0], "values")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(await flag(p.facilitator, roundId, p.elements[0], "values", "Wrong")).toEqual({
      ok: false,
      error: "rater_group_required",
    });
    expect(await unflag(p.facilitator, roundId, p.elements[0], "values")).toEqual({
      ok: false,
      error: "rater_group_required",
    });
    expect(await db.selectFrom("detail_flag").select("id").execute()).toEqual([]);
  });

  it("lets a facilitator in a stakeholder group flag like a participant (DE14)", async () => {
    const joined = await setRaterGroup(db, p.facilitator, {
      projectId: p.projectId,
      groupId: await groupId(db, p.projectId, "Nursing"),
    });
    expect(joined.ok).toBe(true);
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await flag(p.facilitator, roundId, p.elements[0], "values", "Too few values"));
    expect(await ownFlagsOf(p.facilitator, roundId, p.elements[0])).toEqual([
      { kind: "values", reason: "Too few values" },
    ]);
  });

  it("logs that someone flagged, with the round as target and no reason (Q-PRIV-2)", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await flag(p.raters.n1, roundId, p.elements[0], "values", "Invented flag reason"));
    ok(await unflag(p.raters.n1, roundId, p.elements[0], "values"));
    const rows = await db
      .selectFrom("activity_log")
      .select(["action", "target_type", "target_id"])
      .where("action", "like", "detail_flag_%")
      .orderBy("occurred_at")
      .execute();
    expect(rows).toEqual([
      { action: "detail_flag_saved", target_type: "round", target_id: roundId },
      { action: "detail_flag_removed", target_type: "round", target_id: roundId },
    ]);
  });
});

describe("roundFlags (DE17)", () => {
  it("gives the facilitator the counts per detail and the reasons, without names", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const [first, second] = p.elements;
    ok(await flag(p.raters.n1, roundId, first, "data_type", "Should be a count"));
    ok(await flag(p.raters.t1, roundId, first, "data_type", "A count"));
    ok(await flag(p.raters.t1, roundId, first, "values", "No unit"));
    ok(await flag(p.raters.a1, roundId, second, "cardinality", "Repeats"));
    const flags = ok(await roundFlags(db, p.facilitator, { projectId: p.projectId, roundId }));
    const byElement = new Map(flags.map((element) => [element.elementId, element]));
    expect(byElement.size).toBe(2);
    expect(byElement.get(first)?.counts).toEqual({ data_type: 2, cardinality: 0, values: 1 });
    expect(byElement.get(first)?.flags.map(({ kind, reason }) => [kind, reason])).toEqual([
      ["data_type", "A count"],
      ["data_type", "Should be a count"],
      ["values", "No unit"],
    ]);
    expect(byElement.get(second)?.counts).toEqual({ data_type: 0, cardinality: 1, values: 0 });
    const text = JSON.stringify(flags);
    for (const userId of Object.values(p.raters)) expect(text).not.toContain(userId);
    expect(text).not.toContain("Invented Rater");
    // With the rater setting off, the facilitator cannot link a flag to anyone (DE4).
    expect(
      await ratingsByParticipant(db, p.facilitator, { projectId: p.projectId, roundId }),
    ).toEqual({ ok: false, error: "raters_hidden" });
  });

  it("links each flag to its rater when the round shows the raters (DE4)", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId, {
      facilitatorSeesRaters: true,
    });
    ok(await flag(p.raters.t1, roundId, p.elements[0], "values", "No unit"));
    const input = { projectId: p.projectId, roundId };
    const [flagged] = ok(await roundFlags(db, p.facilitator, input));
    const participants = ok(await ratingsByParticipant(db, p.facilitator, input));
    expect(participants).toEqual([
      expect.objectContaining({
        name: "Invented Rater t1",
        ratings: [],
        proposalIds: [],
        flagIds: [flagged?.flags[0]?.id],
      }),
    ]);
  });

  it("refuses a participant reading the flags (forbidden), a non-member and an unknown round", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await flag(p.raters.n1, roundId, p.elements[0], "values", "Invented flag reason"));
    const input = { projectId: p.projectId, roundId };
    expect(await roundFlags(db, p.raters.n2, input)).toEqual({ ok: false, error: "forbidden" });
    expect(await roundFlags(db, p.raters.n1, input)).toEqual({ ok: false, error: "forbidden" });
    expect(await roundFlags(db, p.outsider, input)).toEqual({ ok: false, error: "not_found" });
    expect(
      await roundFlags(db, p.facilitator, {
        projectId: p.projectId,
        roundId: "00000000-0000-4000-8000-000000000000",
      }),
    ).toEqual({ ok: false, error: "round_not_found" });
    // Another participant's own view of the round carries no flag of n1.
    const other = ok(await myRatings(db, p.raters.n2, input, now()));
    expect(JSON.stringify(other)).not.toContain("Invented flag reason");
  });
});
