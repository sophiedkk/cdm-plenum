// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Setting up, opening and closing rounds (DE1, DE2, DE7, DE11 to DE13) on real PostgreSQL, with
// a negative test per role: a participant gets `forbidden`, a non-member `not_found`.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_RULE } from "@/lib/consensus";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { listElements } from "../elements/queries.ts";
import { exportElementsCsv } from "../exports/queries.ts";
import { facilitatorWithProject, insertElement, joinedParticipant } from "../test-fixtures.ts";
import {
  closeRound,
  createRound,
  getRound,
  listRounds,
  openRound,
  panelStatus,
  setChangeClass,
  setPanelMinimums,
  updateRound,
} from "./queries.ts";
import { saveRating } from "./ratings.ts";
import { type CreateRoundInput, PANEL_MINIMUM_REASON_MAX, panelMinimumsInput } from "./schemas.ts";
import {
  closedNow,
  inDays,
  ok,
  openedRound,
  type PanelProject,
  panelProject,
} from "./test-round.ts";

let db: Kysely<DB>;
let p: PanelProject;
const now = () => ({ now: new Date() });
const NO_MINIMUMS = { clinical: null, terminology: null, architecture: null };

beforeEach(async () => {
  db = await createTestDb();
  p = await panelProject(db);
});

afterEach(async () => {
  await db.destroy();
});

async function draft(input: Partial<CreateRoundInput>) {
  return ok(
    await createRound(
      db,
      p.facilitator,
      { projectId: p.projectId, closesAt: inDays(1), ...input },
      now(),
    ),
  );
}

async function actions(targetId: string) {
  const rows = await db
    .selectFrom("activity_log")
    .select("action")
    .where("target_id", "=", targetId)
    .orderBy("id")
    .execute();
  return rows.map((row) => row.action);
}

describe("change class and minimum panel (DE11, DE13)", () => {
  it("shows the joined panel per expert type next to the class D minimum", async () => {
    const status = ok(await panelStatus(db, p.facilitator, p.projectId));
    expect(status).toEqual({
      changeClass: "D",
      classDefault: { clinical: 2, terminology: 1, architecture: 2 },
      overrides: {},
      overridesReason: null,
      minimum: { clinical: 2, terminology: 1, architecture: 2 },
      joined: { clinical: 2, terminology: 1, architecture: 2 },
      shortfall: [],
      locked: false,
    });
  });

  it("applies a new class and the project's own counts with their reason, and reports the shortfall", async () => {
    ok(await setChangeClass(db, p.facilitator, { projectId: p.projectId, changeClass: "A" }));
    ok(
      await setPanelMinimums(db, p.facilitator, {
        projectId: p.projectId,
        minimums: { ...NO_MINIMUMS, clinical: 4 },
        reason: "  Four clinical areas take part.  ",
      }),
    );
    const status = ok(await panelStatus(db, p.facilitator, p.projectId));
    expect(status.classDefault).toEqual({ clinical: 1, terminology: 0, architecture: 1 });
    expect(status.overrides).toEqual({ clinical: 4 });
    expect(status.overridesReason).toBe("Four clinical areas take part.");
    expect(status.minimum).toEqual({ clinical: 4, terminology: 0, architecture: 1 });
    expect(status.shortfall).toEqual([{ expertType: "clinical", joined: 2, minimum: 4 }]);
    ok(
      await setPanelMinimums(db, p.facilitator, {
        projectId: p.projectId,
        minimums: NO_MINIMUMS,
      }),
    );
    const cleared = ok(await panelStatus(db, p.facilitator, p.projectId));
    expect(cleared.overrides).toEqual({});
    expect(cleared.overridesReason).toBeNull();
    expect(await actions(p.projectId)).toEqual([
      "project_created",
      "change_class_set",
      "panel_minimum_set",
      "panel_minimum_set",
    ]);
  });

  it("refuses project counts without a reason and keeps the earlier ones (DE13)", async () => {
    const input = { projectId: p.projectId, minimums: { ...NO_MINIMUMS, terminology: 0 } };
    ok(await setPanelMinimums(db, p.facilitator, { ...input, reason: "No terminologist yet." }));
    for (const reason of [undefined, "", "   "]) {
      expect(
        await setPanelMinimums(db, p.facilitator, {
          projectId: p.projectId,
          minimums: { ...NO_MINIMUMS, architecture: 5 },
          ...(reason === undefined ? {} : { reason }),
        }),
      ).toEqual({ ok: false, error: "minimum_reason_required" });
    }
    const status = ok(await panelStatus(db, p.facilitator, p.projectId));
    expect(status.overrides).toEqual({ terminology: 0 });
    expect(status.overridesReason).toBe("No terminologist yet.");
  });

  it("refuses a reason longer than the database takes (DE13)", async () => {
    const tooLong = "x".repeat(PANEL_MINIMUM_REASON_MAX + 1);
    for (const reason of [tooLong, "  "]) {
      await expect(
        db
          .transaction()
          .execute((trx) =>
            trx
              .updateTable("project")
              .set({ panel_minimum_reason: reason })
              .where("id", "=", p.projectId)
              .execute(),
          ),
      ).rejects.toThrow(/project_panel_minimum_reason_check/);
    }
    const input = { projectId: p.projectId, minimums: NO_MINIMUMS, reason: tooLong };
    expect(panelMinimumsInput.safeParse(input).success).toBe(false);
  });

  it("counts only participants who joined a group of an expert type", async () => {
    await joinedParticipant(db, p.facilitator, p.projectId, "General medicine", "gm1");
    const status = ok(await panelStatus(db, p.facilitator, p.projectId));
    expect(status.joined).toEqual({ clinical: 3, terminology: 1, architecture: 2 });
  });

  it("refuses a change to the class or the minimum once the first round opened", async () => {
    await openedRound(db, p.facilitator, p.projectId);
    expect(
      await setChangeClass(db, p.facilitator, { projectId: p.projectId, changeClass: "B" }),
    ).toEqual({ ok: false, error: "panel_locked" });
    expect(
      await setPanelMinimums(db, p.facilitator, {
        projectId: p.projectId,
        minimums: { ...NO_MINIMUMS, terminology: 0 },
        reason: "Too late.",
      }),
    ).toEqual({ ok: false, error: "panel_locked" });
    expect(ok(await panelStatus(db, p.facilitator, p.projectId)).locked).toBe(true);
  });

  it("refuses a participant (forbidden) and a non-member (not_found)", async () => {
    const classInput = { projectId: p.projectId, changeClass: "B" } as const;
    const minInput = {
      projectId: p.projectId,
      minimums: { ...NO_MINIMUMS, clinical: 1 },
      reason: "A reason.",
    };
    for (const [user, error] of [
      [p.raters.n1, "forbidden"],
      [p.outsider, "not_found"],
    ] as const) {
      expect(await setChangeClass(db, user, classInput)).toEqual({ ok: false, error });
      expect(await setPanelMinimums(db, user, minInput)).toEqual({ ok: false, error });
      expect(await panelStatus(db, user, p.projectId)).toEqual({ ok: false, error });
    }
  });
});

describe("createRound (DE1)", () => {
  it("creates round 1 in draft with the DE1 rule, raters hidden and every unmerged element", async () => {
    const merged = await insertElement(db, p.projectId, "Old systolic");
    await db
      .updateTable("element")
      .set({ merged_into: p.elements[0] })
      .where("id", "=", merged)
      .execute();
    const { roundId, number } = await draft({});
    expect(number).toBe(1);
    const round = ok(await getRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    expect(round.status).toBe("draft");
    expect(round.rule).toEqual(DEFAULT_RULE);
    expect(round.facilitatorSeesRaters).toBe(false);
    expect(round.snapshot).toBeNull();
    expect(round.elements.map((e) => e.id)).toEqual(p.elements);
    expect(await actions(roundId)).toEqual(["round_created"]);
  });

  it("takes an adjusted scale and thresholds, the rater setting and chosen elements", async () => {
    const rule = { scaleMin: 1, scaleMax: 5, bottomBandMax: 2, topBandMin: 4, agreementPct: 75.5 };
    const { roundId } = await draft({
      rule,
      facilitatorSeesRaters: true,
      elementIds: [p.elements[1]],
    });
    const round = ok(await getRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    expect(round.rule).toEqual({ ...rule, oppositionPct: 15 });
    expect(round.facilitatorSeesRaters).toBe(true);
    expect(round.elements.map((e) => e.id)).toEqual([p.elements[1]]);
  });

  it("refuses an invalid rule with the reason from ruleError", async () => {
    const input = { projectId: p.projectId, closesAt: inDays(1) };
    for (const [rule, problem] of [
      [{ topBandMin: 3 }, "bands_overlap"],
      [{ scaleMax: 1 }, "scale_too_short"],
      [{ agreementPct: 50 }, "agreement_not_above_half"],
      [{ oppositionPct: 80 }, "opposition_not_below_agreement"],
      [{ bottomBandMax: 0 }, "bands_outside_scale"],
    ] as const) {
      expect(await createRound(db, p.facilitator, { ...input, rule }, now())).toEqual({
        ok: false,
        error: "rule_invalid",
        rule: problem,
      });
    }
  });

  it("refuses a closing date in the past and an element of another project or merged", async () => {
    expect(
      await createRound(
        db,
        p.facilitator,
        { projectId: p.projectId, closesAt: new Date(Date.now() - 1000) },
        now(),
      ),
    ).toEqual({ ok: false, error: "closes_at_past" });
    const other = await facilitatorWithProject(db, "other");
    const foreign = await insertElement(db, other.projectId, "Foreign");
    const input = { projectId: p.projectId, closesAt: inDays(1) };
    expect(
      await createRound(db, p.facilitator, { ...input, elementIds: [foreign] }, now()),
    ).toEqual({ ok: false, error: "element_not_found" });
    await db
      .updateTable("element")
      .set({ merged_into: p.elements[0] })
      .where("id", "=", p.elements[1])
      .execute();
    expect(
      await createRound(db, p.facilitator, { ...input, elementIds: [p.elements[1]] }, now()),
    ).toEqual({ ok: false, error: "element_not_found" });
  });

  it("refuses a second round while the previous one is not closed", async () => {
    await draft({});
    expect(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(1) }, now()),
    ).toEqual({ ok: false, error: "previous_round_not_closed" });
  });

  it("carries over the elements without consensus into round 2 (DE7)", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const [included, , noConsensus] = p.elements;
    for (const rater of Object.values(p.raters)) {
      const rate = (elementId: string, score: number) =>
        saveRating(db, rater, { projectId: p.projectId, roundId, elementId, score });
      ok(await rate(included, 9));
      ok(await rate(p.elements[1], 1));
    }
    ok(
      await saveRating(db, p.raters.n1, {
        projectId: p.projectId,
        roundId,
        elementId: noConsensus,
        score: 5,
      }),
    );
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const next = await draft({});
    expect(next.number).toBe(2);
    const round = ok(
      await getRound(db, p.facilitator, { projectId: p.projectId, roundId: next.roundId }, now()),
    );
    expect(round.elements.map((e) => e.id)).toEqual([noConsensus]);
  });

  it("refuses a participant (forbidden) and a non-member (not_found)", async () => {
    const input = { projectId: p.projectId, closesAt: inDays(1) };
    expect(await createRound(db, p.raters.n1, input, now())).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await createRound(db, p.outsider, input, now())).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("updateRound (DE1, DE2)", () => {
  it("changes a draft's rule, closing date, rater setting and elements", async () => {
    const { roundId } = await draft({});
    const closesAt = inDays(3);
    ok(
      await updateRound(
        db,
        p.facilitator,
        {
          projectId: p.projectId,
          roundId,
          rule: { agreementPct: 80, oppositionPct: 10 },
          closesAt,
          facilitatorSeesRaters: true,
          elementIds: [p.elements[2], p.elements[0]],
        },
        now(),
      ),
    );
    const round = ok(await getRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    expect(round.rule).toEqual({ ...DEFAULT_RULE, agreementPct: 80, oppositionPct: 10 });
    expect(round.closesAt).toBe(closesAt.toISOString());
    expect(round.facilitatorSeesRaters).toBe(true);
    expect(round.elements.map((e) => e.id)).toEqual([p.elements[0], p.elements[2]]);
    expect(await actions(roundId)).toEqual(["round_created", "round_updated"]);
  });

  it("refuses a change to the rule, the closing date or the rater setting once open (DE2)", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const base = { projectId: p.projectId, roundId };
    for (const change of [
      { rule: { agreementPct: 60 } },
      { closesAt: inDays(5) },
      { facilitatorSeesRaters: true },
      { elementIds: [p.elements[0]] },
    ]) {
      expect(await updateRound(db, p.facilitator, { ...base, ...change }, now())).toEqual({
        ok: false,
        error: "round_not_draft",
      });
    }
    const round = ok(await getRound(db, p.facilitator, base, now()));
    expect(round.rule).toEqual(DEFAULT_RULE);
    expect(round.facilitatorSeesRaters).toBe(false);
  });

  it("refuses an invalid rule, a past closing date, a foreign element and an unknown round", async () => {
    const { roundId } = await draft({});
    const base = { projectId: p.projectId, roundId };
    expect(
      await updateRound(db, p.facilitator, { ...base, rule: { topBandMin: 2 } }, now()),
    ).toEqual({ ok: false, error: "rule_invalid", rule: "bands_overlap" });
    expect(
      await updateRound(db, p.facilitator, { ...base, closesAt: new Date(Date.now() - 1) }, now()),
    ).toEqual({ ok: false, error: "closes_at_past" });
    expect(
      await updateRound(
        db,
        p.facilitator,
        { ...base, elementIds: ["00000000-0000-4000-8000-000000000000"] },
        now(),
      ),
    ).toEqual({ ok: false, error: "element_not_found" });
    expect(
      await updateRound(
        db,
        p.facilitator,
        { projectId: p.projectId, roundId: "00000000-0000-4000-8000-000000000000" },
        now(),
      ),
    ).toEqual({ ok: false, error: "round_not_found" });
  });

  it("refuses a participant (forbidden) and a non-member (not_found)", async () => {
    const { roundId } = await draft({});
    const input = { projectId: p.projectId, roundId, facilitatorSeesRaters: true };
    expect(await updateRound(db, p.raters.n1, input, now())).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await updateRound(db, p.outsider, input, now())).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("openRound and the private brainstorm (EL13, ADR 0012)", () => {
  async function revealState() {
    const project = await db
      .selectFrom("project")
      .select(["private_brainstorm", "board_revealed_at"])
      .where("id", "=", p.projectId)
      .executeTakeFirstOrThrow();
    const logged = await db
      .selectFrom("activity_log")
      .select("id")
      .where("project_id", "=", p.projectId)
      .where("action", "=", "board_revealed")
      .execute();
    return { project, reveals: logged.length };
  }

  it("reveals the board of a project still in its private step, and logs it once", async () => {
    const before = await revealState();
    expect(before.project.private_brainstorm).toBe(true);
    expect(before.project.board_revealed_at).toBeNull();
    const { roundId } = await draft({});
    ok(await openRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    const after = await revealState();
    expect(after.project.board_revealed_at).not.toBeNull();
    expect(after.reveals).toBe(1);
  });

  it("leaves an already revealed board alone", async () => {
    const revealedAt = new Date("2026-11-01T10:00:00Z");
    await db
      .updateTable("project")
      .set({ board_revealed_at: revealedAt })
      .where("id", "=", p.projectId)
      .execute();
    const { roundId } = await draft({});
    ok(await openRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    const after = await revealState();
    expect(after.project.board_revealed_at).toEqual(revealedAt);
    expect(after.reveals).toBe(0);
  });
});

describe("openRound (DE11, DE12)", () => {
  it("opens with a complete panel and stores the panel and minimum without a reason", async () => {
    const { roundId } = await draft({});
    const opened = await openRound(
      db,
      p.facilitator,
      { projectId: p.projectId, roundId, belowMinimumReason: "ignored" },
      now(),
    );
    expect(opened).toEqual({ ok: true, value: { status: "complete", shortfall: [] } });
    const round = ok(await getRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()));
    expect(round.status).toBe("open");
    expect(round.snapshot).toEqual({
      panel: { clinical: 2, terminology: 1, architecture: 2 },
      minimum: { clinical: 2, terminology: 1, architecture: 2 },
      belowMinimumReason: null,
    });
    expect(await actions(roundId)).toEqual(["round_created", "round_opened"]);
  });

  it("asks for a reason below the minimum, then opens with it and keeps the snapshot (DE12)", async () => {
    ok(
      await setPanelMinimums(db, p.facilitator, {
        projectId: p.projectId,
        minimums: { ...NO_MINIMUMS, terminology: 3 },
        reason: "Three terminologists review the codes.",
      }),
    );
    const { roundId } = await draft({});
    const shortfall = [{ expertType: "terminology", joined: 1, minimum: 3 }];
    for (const reason of [undefined, "   "]) {
      const input = {
        projectId: p.projectId,
        roundId,
        ...(reason === undefined ? {} : { belowMinimumReason: reason }),
      };
      expect(await openRound(db, p.facilitator, input, now())).toEqual({
        ok: false,
        error: "reason_required",
        shortfall,
      });
    }
    expect(
      ok(await getRound(db, p.facilitator, { projectId: p.projectId, roundId }, now())).status,
    ).toBe("draft");
    expect(
      await openRound(
        db,
        p.facilitator,
        { projectId: p.projectId, roundId, belowMinimumReason: " Teaching group " },
        now(),
      ),
    ).toEqual({ ok: true, value: { status: "below_minimum", shortfall } });
    // A participant joining later does not rewrite what the round opened with.
    await joinedParticipant(db, p.facilitator, p.projectId, "Terminology", "t2");
    const round = ok(await getRound(db, p.raters.n1, { projectId: p.projectId, roundId }, now()));
    expect(round.snapshot).toEqual({
      panel: { clinical: 2, terminology: 1, architecture: 2 },
      minimum: { clinical: 2, terminology: 3, architecture: 2 },
      belowMinimumReason: "Teaching group",
    });
  });

  it("opens with an expert type missing entirely, given a reason", async () => {
    const { userId: facilitator, projectId } = await facilitatorWithProject(db, "small");
    await joinedParticipant(db, facilitator, projectId, "Nursing", "s1");
    await insertElement(db, projectId, "Heart rate");
    const { roundId } = ok(
      await createRound(db, facilitator, { projectId, closesAt: inDays(1) }, now()),
    );
    const opened = await openRound(
      db,
      facilitator,
      { projectId, roundId, belowMinimumReason: "Course group" },
      now(),
    );
    expect(opened.ok && opened.value.shortfall.map((s) => s.expertType)).toEqual([
      "clinical",
      "terminology",
      "architecture",
    ]);
  });

  it("refuses a round without elements, after its closing date, or already open", async () => {
    const { roundId } = await draft({ elementIds: [] });
    const input = { projectId: p.projectId, roundId };
    expect(await openRound(db, p.facilitator, input, now())).toEqual({
      ok: false,
      error: "round_has_no_elements",
    });
    ok(await updateRound(db, p.facilitator, { ...input, elementIds: [p.elements[0]] }, now()));
    expect(await openRound(db, p.facilitator, input, { now: inDays(2) })).toEqual({
      ok: false,
      error: "closes_at_past",
    });
    ok(await openRound(db, p.facilitator, input, now()));
    expect(await openRound(db, p.facilitator, input, now())).toEqual({
      ok: false,
      error: "round_not_draft",
    });
  });

  it("refuses a participant (forbidden), a non-member (not_found) and an unknown round", async () => {
    const { roundId } = await draft({});
    const input = { projectId: p.projectId, roundId };
    expect(await openRound(db, p.raters.n1, input, now())).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await openRound(db, p.outsider, input, now())).toEqual({
      ok: false,
      error: "not_found",
    });
    const other = await facilitatorWithProject(db, "other");
    expect(
      await openRound(db, other.userId, { projectId: other.projectId, roundId }, now()),
    ).toEqual({ ok: false, error: "round_not_found" });
  });
});

describe("closeRound (DE5)", () => {
  it("refuses before the closing date, a draft and a closed round", async () => {
    const { roundId: draftId } = await draft({});
    const draftInput = { projectId: p.projectId, roundId: draftId };
    expect(await closeRound(db, p.facilitator, draftInput, { now: inDays(2) })).toEqual({
      ok: false,
      error: "round_not_open",
    });
    ok(await openRound(db, p.facilitator, draftInput, now()));
    expect(await closeRound(db, p.facilitator, draftInput, now())).toEqual({
      ok: false,
      error: "round_not_due",
    });
    expect(await closedNow(db, p.facilitator, p.projectId, draftId)).toEqual({
      included: 0,
      excluded: 0,
      no_consensus: 3,
    });
    expect(await closeRound(db, p.facilitator, draftInput, { now: inDays(3) })).toEqual({
      ok: false,
      error: "round_not_open",
    });
    expect(await actions(draftId)).toEqual(["round_created", "round_opened", "round_closed"]);
  });

  it("keeps an element that is not in the model on the board and in the export (DE1)", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const cuff = p.elements[2];
    for (const rater of Object.values(p.raters)) {
      ok(
        await saveRating(db, rater, { projectId: p.projectId, roundId, elementId: cuff, score: 1 }),
      );
    }
    expect(await closedNow(db, p.facilitator, p.projectId, roundId)).toMatchObject({
      excluded: 1,
    });
    const board = await listElements(db, p.raters.n1, p.projectId);
    expect(board.ok && board.value.map((element) => element.name)).toContain("Cuff size");
    const file = await exportElementsCsv(db, p.facilitator, p.projectId);
    if (!file.ok) throw new Error(file.error);
    const row = file.value.content.split("\r\n").find((line) => line.includes("Cuff size"));
    expect(row).toContain("excluded");
  });

  it("refuses a participant (forbidden) and a non-member (not_found)", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const input = { projectId: p.projectId, roundId };
    expect(await closeRound(db, p.raters.n1, input, { now: inDays(2) })).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await closeRound(db, p.outsider, input, { now: inDays(2) })).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("listRounds and getRound", () => {
  it("shows the facilitator drafts and a participant only opened rounds", async () => {
    const first = await openedRound(db, p.facilitator, p.projectId);
    await closedNow(db, p.facilitator, p.projectId, first);
    const { roundId: second } = await draft({});
    const all = ok(await listRounds(db, p.facilitator, p.projectId, now()));
    expect(all.map((r) => [r.number, r.status])).toEqual([
      [2, "draft"],
      [1, "closed"],
    ]);
    const seen = ok(await listRounds(db, p.raters.n1, p.projectId, now()));
    expect(seen.map((r) => r.number)).toEqual([1]);
    expect(
      await getRound(db, p.raters.n1, { projectId: p.projectId, roundId: second }, now()),
    ).toEqual({ ok: false, error: "round_not_found" });
    expect(await listRounds(db, p.outsider, p.projectId, now())).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await getRound(db, p.outsider, { projectId: p.projectId, roundId: first }, now()),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("shows a round past its closing date as awaiting close", async () => {
    await openedRound(db, p.facilitator, p.projectId);
    const rounds = ok(await listRounds(db, p.raters.n1, p.projectId, { now: inDays(2) }));
    expect(rounds[0]?.status).toBe("awaiting_close");
  });
});
