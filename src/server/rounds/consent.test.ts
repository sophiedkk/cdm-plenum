// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Consent rounds of a Team project (DE20, ADR 0023) on real PostgreSQL: answering, the outcome
// when the round closes, the results by name and settling "To discuss", with a negative test per
// role and per mode.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConsentAnswer } from "@/lib/consent";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { decidedSoFar, overviewFacts } from "../projects/overview.ts";
import { projectOverview } from "../projects/phase.ts";
import { clearConsent, saveConsent, settleElement } from "./consent.ts";
import { createRound, getRound, listRounds, updateRound } from "./queries.ts";
import { myRatings, ratingsByParticipant, saveRating } from "./ratings.ts";
import { responseRate, roundResults } from "./results.ts";
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

beforeEach(async () => {
  db = await createTestDb();
  p = await panelProject(db);
});

afterEach(async () => {
  await db.destroy();
});

async function makeTeam() {
  await db.updateTable("project").set({ mode: "team" }).where("id", "=", p.projectId).execute();
  // Names the members see; an account without one shows its address.
  const names: Record<string, string> = {
    n1: "Ann",
    n2: "Bo",
    t1: "Cas",
    a1: "Dee",
    a2: "Eli",
  };
  for (const [key, userId] of Object.entries(p.raters)) {
    await db
      .updateTable("user")
      .set({ name: names[key] ?? key })
      .where("id", "=", userId)
      .execute();
  }
}

function answer(
  userId: string,
  roundId: string,
  elementId: string,
  value: ConsentAnswer,
  reason?: string,
) {
  return saveConsent(db, userId, {
    projectId: p.projectId,
    roundId,
    elementId,
    answer: value,
    ...(reason === undefined ? {} : { reason }),
  });
}

const raters = () => Object.values(p.raters);

async function teamRound() {
  await makeTeam();
  return openedRound(db, p.facilitator, p.projectId);
}

describe("saveConsent and clearConsent (DE20)", () => {
  it("saves, changes and clears an answer, with a reason for Leave out and Discuss", async () => {
    const roundId = await teamRound();
    const [first, second, third] = p.elements;
    ok(await answer(p.raters.n1, roundId, first, "include"));
    ok(await answer(p.raters.n1, roundId, first, "leave_out", "  Not needed for triage  "));
    ok(await answer(p.raters.n1, roundId, second, "discuss", "Unclear definition"));
    ok(await answer(p.raters.n1, roundId, third, "abstain", "ignored"));
    let mine = ok(await myRatings(db, p.raters.n1, { projectId: p.projectId, roundId }, now()));
    expect(mine.round.mode).toBe("team");
    expect(mine.elements.map((e) => e.own)).toEqual([
      { rated: true, score: null, reason: "Not needed for triage", answer: "leave_out" },
      { rated: true, score: null, reason: "Unclear definition", answer: "discuss" },
      { rated: true, score: null, reason: null, answer: "abstain" },
    ]);
    ok(
      await clearConsent(db, p.raters.n1, {
        projectId: p.projectId,
        roundId,
        elementId: first,
      }),
    );
    mine = ok(await myRatings(db, p.raters.n1, { projectId: p.projectId, roundId }, now()));
    expect(mine.elements[0]?.own).toEqual({
      rated: false,
      score: null,
      reason: null,
      answer: null,
    });
  });

  it("keeps an optional reason on Include", async () => {
    const roundId = await teamRound();
    ok(await answer(p.raters.n1, roundId, p.elements[0], "include", "Core of the concept"));
    const mine = ok(await myRatings(db, p.raters.n1, { projectId: p.projectId, roundId }, now()));
    expect(mine.elements[0]?.own.reason).toBe("Core of the concept");
  });

  it("refuses Leave out and Discuss without a reason", async () => {
    const roundId = await teamRound();
    for (const value of ["leave_out", "discuss"] as const) {
      for (const reason of [undefined, "", "   "]) {
        expect(await answer(p.raters.n1, roundId, p.elements[0], value, reason)).toEqual({
          ok: false,
          error: "consent_reason_required",
        });
      }
    }
  });

  it("refuses an element outside the round and an answer from an outsider", async () => {
    await makeTeam();
    const roundId = await openedRound(db, p.facilitator, p.projectId, {
      elementIds: [p.elements[0]],
    });
    expect(await answer(p.raters.n1, roundId, p.elements[1], "include")).toEqual({
      ok: false,
      error: "element_not_in_round",
    });
    expect(await answer(p.outsider, roundId, p.elements[0], "include")).toEqual({
      ok: false,
      error: "not_found",
    });
    expect(
      await clearConsent(db, p.outsider, {
        projectId: p.projectId,
        roundId,
        elementId: p.elements[0],
      }),
    ).toEqual({ ok: false, error: "not_found" });
  });

  it("lets a facilitator answer only from a stakeholder group (DE14)", async () => {
    const roundId = await teamRound();
    expect(await answer(p.facilitator, roundId, p.elements[0], "include")).toEqual({
      ok: false,
      error: "rater_group_required",
    });
  });

  it("refuses an answer in a draft round", async () => {
    await makeTeam();
    const draft = ok(
      await createRound(
        db,
        p.facilitator,
        { projectId: p.projectId, closesAt: inDays(1) },
        { now: new Date() },
      ),
    ).roundId;
    expect(await answer(p.raters.n1, draft, p.elements[0], "include")).toEqual({
      ok: false,
      error: "round_not_found",
    });
  });

  it("refuses an answer once the round has closed", async () => {
    const roundId = await teamRound();
    ok(await answer(p.raters.n1, roundId, p.elements[0], "include"));
    await closedNow(db, p.facilitator, p.projectId, roundId);
    expect(
      await answer(p.raters.n1, roundId, p.elements[0], "leave_out", "Changed my mind"),
    ).toEqual({ ok: false, error: "round_not_open" });
    expect(
      await clearConsent(db, p.raters.n1, {
        projectId: p.projectId,
        roundId,
        elementId: p.elements[0],
      }),
    ).toEqual({ ok: false, error: "round_not_open" });
  });
});

describe("modes", () => {
  it("refuses a consent answer in a Delphi round", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    for (const userId of [p.raters.n1, p.facilitator, p.outsider]) {
      const expected = userId === p.outsider ? "not_found" : "team_round_only";
      expect(await answer(userId, roundId, p.elements[0], "include")).toEqual({
        ok: false,
        error: expected,
      });
    }
    expect(
      await clearConsent(db, p.raters.n1, {
        projectId: p.projectId,
        roundId,
        elementId: p.elements[0],
      }),
    ).toEqual({ ok: false, error: "team_round_only" });
  });

  it("refuses a score in a Team round, in the server and in the database", async () => {
    const roundId = await teamRound();
    expect(
      await saveRating(db, p.raters.n1, {
        projectId: p.projectId,
        roundId,
        elementId: p.elements[0],
        score: 8,
      }),
    ).toEqual({ ok: false, error: "delphi_round_only" });
    expect(
      await saveRating(db, p.outsider, {
        projectId: p.projectId,
        roundId,
        elementId: p.elements[0],
        score: 8,
      }),
    ).toEqual({ ok: false, error: "not_found" });
    // The trigger holds even for code that skips the server check.
    const code = await db.selectFrom("rating_code").select("id").executeTakeFirstOrThrow();
    await expect(
      db.transaction().execute((trx) =>
        trx
          .insertInto("rating")
          .values({
            round_id: roundId,
            element_id: p.elements[0],
            rating_code_id: code.id,
            score: 8,
          })
          .execute(),
      ),
    ).rejects.toThrow("rating_project_team");
  });

  it("refuses the facilitator's view of raters in a Team round", async () => {
    const roundId = await teamRound();
    expect(
      await ratingsByParticipant(db, p.facilitator, { projectId: p.projectId, roundId }),
    ).toEqual({ ok: false, error: "delphi_round_only" });
  });

  it("sets up a Team round without a rule, and refuses a rule or rater setting", async () => {
    await makeTeam();
    const input = { projectId: p.projectId, closesAt: inDays(1) };
    expect(
      await createRound(db, p.facilitator, { ...input, rule: { scaleMax: 5 } }, now()),
    ).toEqual({ ok: false, error: "delphi_round_only" });
    expect(
      await createRound(db, p.facilitator, { ...input, facilitatorSeesRaters: true }, now()),
    ).toEqual({ ok: false, error: "delphi_round_only" });
    const { roundId } = ok(await createRound(db, p.facilitator, input, now()));
    expect(
      await updateRound(
        db,
        p.facilitator,
        { projectId: p.projectId, roundId, rule: { scaleMax: 5 } },
        now(),
      ),
    ).toEqual({ ok: false, error: "delphi_round_only" });
    const detail = ok(
      await getRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()),
    );
    expect(detail.mode).toBe("team");
    expect(detail.elements).toHaveLength(3);
    const list = ok(await listRounds(db, p.facilitator, p.projectId, now()));
    expect(list[0]?.mode).toBe("team");
  });

  it("keeps a Delphi round as it was", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    const detail = ok(
      await getRound(db, p.facilitator, { projectId: p.projectId, roundId }, now()),
    );
    expect(detail.mode).toBe("delphi");
    expect(detail.rule.scaleMax).toBe(9);
  });
});

describe("database constraints on a consent answer", () => {
  async function insert(
    roundId: string,
    values: { answer: string; reason: string | null },
  ): Promise<void> {
    const member = await db
      .selectFrom("member")
      .select("id")
      .where("organizationId", "=", p.projectId)
      .where("userId", "=", p.raters.n1)
      .executeTakeFirstOrThrow();
    await db.transaction().execute((trx) =>
      trx
        .insertInto("consent_answer")
        .values({ round_id: roundId, element_id: p.elements[0], member_id: member.id, ...values })
        .execute(),
    );
  }

  it("takes only the four answers, and holds the reason rule", async () => {
    const roundId = await teamRound();
    await expect(insert(roundId, { answer: "maybe", reason: null })).rejects.toThrow(
      "consent_answer_answer_check",
    );
    await expect(insert(roundId, { answer: "leave_out", reason: null })).rejects.toThrow(
      "consent_answer_reason_check",
    );
    await expect(insert(roundId, { answer: "discuss", reason: "  " })).rejects.toThrow(
      "consent_answer_reason_check",
    );
    await expect(insert(roundId, { answer: "abstain", reason: "why" })).rejects.toThrow(
      "consent_answer_reason_check",
    );
    await insert(roundId, { answer: "include", reason: null });
  });

  it("refuses an answer in a Delphi project", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    await expect(insert(roundId, { answer: "include", reason: null })).rejects.toThrow(
      "consent_project_not_team",
    );
  });
});

/** Every member answers the three elements: include, leave out, and a mix. */
async function answerAll(roundId: string) {
  const [included, excluded, mixed] = p.elements;
  for (const userId of raters()) {
    ok(await answer(userId, roundId, included, "include"));
    ok(await answer(userId, roundId, excluded, "leave_out", "Out of scope"));
  }
  ok(await answer(p.raters.n1, roundId, mixed, "include"));
  ok(await answer(p.raters.n2, roundId, mixed, "leave_out", "Too detailed"));
  ok(await answer(p.raters.t1, roundId, mixed, "discuss", "Needs a code"));
  ok(await answer(p.raters.a1, roundId, mixed, "abstain"));
}

describe("closing a Team round (DE20)", () => {
  it("includes, excludes and leaves a mix to discuss; Unable to judge does not count", async () => {
    const roundId = await teamRound();
    await answerAll(roundId);
    // One member abstains on an otherwise unanimous element: it still counts as unanimous.
    ok(await answer(p.raters.a2, roundId, p.elements[0], "abstain"));
    expect(await closedNow(db, p.facilitator, p.projectId, roundId)).toEqual({
      included: 1,
      excluded: 1,
      no_consensus: 1,
    });
    const rows = await db
      .selectFrom("round_element")
      .select(["element_id", "outcome"])
      .where("round_id", "=", roundId)
      .execute();
    const outcome = new Map(rows.map((row) => [row.element_id, row.outcome]));
    expect(outcome.get(p.elements[0])).toBe("included");
    expect(outcome.get(p.elements[1])).toBe("excluded");
    expect(outcome.get(p.elements[2])).toBe("no_consensus");
  });

  it("leaves an element without answers to discuss", async () => {
    const roundId = await teamRound();
    expect(await closedNow(db, p.facilitator, p.projectId, roundId)).toEqual({
      included: 0,
      excluded: 0,
      no_consensus: 3,
    });
  });

  it("carries only the unsettled elements into the next round", async () => {
    const roundId = await teamRound();
    await answerAll(roundId);
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const next = ok(
      await createRound(db, p.facilitator, { projectId: p.projectId, closesAt: inDays(5) }, now()),
    );
    const detail = ok(
      await getRound(db, p.facilitator, { projectId: p.projectId, roundId: next.roundId }, now()),
    );
    expect(detail.elements.map((e) => e.id)).toEqual([p.elements[2]]);
  });
});

describe("results by name (ADR 0023)", () => {
  it("shows every member each answer by name once the round has closed", async () => {
    const roundId = await teamRound();
    await answerAll(roundId);
    for (const userId of [p.facilitator, p.raters.n1, p.outsider]) {
      expect((await roundResults(db, userId, { projectId: p.projectId, roundId }, now())).ok).toBe(
        false,
      );
    }
    await closedNow(db, p.facilitator, p.projectId, roundId);
    for (const userId of [p.facilitator, p.raters.n1, p.raters.a2]) {
      const results = ok(
        await roundResults(db, userId, { projectId: p.projectId, roundId }, now()),
      );
      expect(results.round.mode).toBe("team");
      const mixed = results.elements.find((e) => e.id === p.elements[2]);
      expect(mixed?.outcome).toBe("no_consensus");
      expect(mixed?.consent?.counts).toEqual({ include: 1, leave_out: 1, discuss: 1, abstain: 1 });
      expect(mixed?.consent?.answers).toEqual([
        { name: "Ann", answer: "include", reason: null },
        { name: "Bo", answer: "leave_out", reason: "Too detailed" },
        { name: "Cas", answer: "discuss", reason: "Needs a code" },
        { name: "Dee", answer: "abstain", reason: null },
      ]);
      expect(mixed?.consent?.settled).toBeNull();
    }
  });

  it("gives an outsider nothing", async () => {
    const roundId = await teamRound();
    await closedNow(db, p.facilitator, p.projectId, roundId);
    expect(await roundResults(db, p.outsider, { projectId: p.projectId, roundId }, now())).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("names no one in the answers of a member's own card and no identifier anywhere", async () => {
    const roundId = await teamRound();
    await answerAll(roundId);
    const mine = ok(await myRatings(db, p.raters.n1, { projectId: p.projectId, roundId }, now()));
    const text = JSON.stringify(mine);
    for (const name of ["Bo", "Cas", "Dee", "Eli"]) expect(text).not.toContain(`"${name}"`);
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const results = ok(
      await roundResults(db, p.raters.n2, { projectId: p.projectId, roundId }, now()),
    );
    const members = await db
      .selectFrom("member")
      .select("id")
      .where("organizationId", "=", p.projectId)
      .execute();
    const json = JSON.stringify(results);
    for (const id of [...members.map((m) => m.id), ...Object.values(p.raters), p.facilitator]) {
      expect(json).not.toContain(id);
    }
    expect(json).not.toContain("@example.test");
  });

  it("shows the previous round's answers by name on the next round's cards", async () => {
    const roundId = await teamRound();
    await answerAll(roundId);
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const next = await openedRound(db, p.facilitator, p.projectId);
    const mine = ok(
      await myRatings(db, p.raters.a2, { projectId: p.projectId, roundId: next }, now()),
    );
    expect(mine.elements).toHaveLength(1);
    const previous = mine.elements[0]?.previousConsent;
    expect(previous?.number).toBe(1);
    expect(previous?.answers.map((row) => row.name)).toEqual(["Ann", "Bo", "Cas", "Dee"]);
    expect(mine.elements[0]?.own.answer).toBeNull();
  });
});

describe("settleElement (DE20)", () => {
  async function closedWithMix() {
    const roundId = await teamRound();
    await answerAll(roundId);
    await closedNow(db, p.facilitator, p.projectId, roundId);
    return roundId;
  }
  const settle = (userId: string, roundId: string, elementId: string, note: string) =>
    settleElement(
      db,
      userId,
      { projectId: p.projectId, roundId, elementId, outcome: "included", note },
      now(),
    );

  it("settles a To discuss element with a note, and the outcome follows", async () => {
    const roundId = await closedWithMix();
    ok(
      await settleElement(
        db,
        p.facilitator,
        {
          projectId: p.projectId,
          roundId,
          elementId: p.elements[2],
          outcome: "excluded",
          note: "  Covered by the cuff element  ",
        },
        now(),
      ),
    );
    const row = await db
      .selectFrom("round_element")
      .select(["outcome", "settled_note", "settled_at"])
      .where("round_id", "=", roundId)
      .where("element_id", "=", p.elements[2])
      .executeTakeFirstOrThrow();
    expect(row.outcome).toBe("excluded");
    expect(row.settled_note).toBe("Covered by the cuff element");
    expect(row.settled_at).not.toBeNull();
    const results = ok(
      await roundResults(db, p.raters.n1, { projectId: p.projectId, roundId }, now()),
    );
    const mixed = results.elements.find((e) => e.id === p.elements[2]);
    expect(mixed?.outcome).toBe("excluded");
    expect(mixed?.consent?.settled?.note).toBe("Covered by the cuff element");
    const log = await db
      .selectFrom("activity_log")
      .select("action")
      .where("project_id", "=", p.projectId)
      .execute();
    expect(log.map((entry) => entry.action)).toContain("element_settled");
  });

  it("refuses without a note", async () => {
    const roundId = await closedWithMix();
    for (const note of ["", "   "]) {
      expect(await settle(p.facilitator, roundId, p.elements[2], note)).toEqual({
        ok: false,
        error: "settle_note_required",
      });
    }
  });

  it("refuses an element that is not To discuss, and one settled already", async () => {
    const roundId = await closedWithMix();
    for (const element of [p.elements[0], p.elements[1]]) {
      expect(await settle(p.facilitator, roundId, element, "Fine")).toEqual({
        ok: false,
        error: "element_not_to_discuss",
      });
    }
    ok(await settle(p.facilitator, roundId, p.elements[2], "Agreed in the meeting"));
    expect(await settle(p.facilitator, roundId, p.elements[2], "Again")).toEqual({
      ok: false,
      error: "element_not_to_discuss",
    });
  });

  it("refuses a round that has not closed and an element outside the round", async () => {
    await makeTeam();
    const roundId = await openedRound(db, p.facilitator, p.projectId, {
      elementIds: [p.elements[0]],
    });
    expect(await settle(p.facilitator, roundId, p.elements[0], "Early")).toEqual({
      ok: false,
      error: "round_not_closed",
    });
    await closedNow(db, p.facilitator, p.projectId, roundId);
    expect(await settle(p.facilitator, roundId, p.elements[1], "Not here")).toEqual({
      ok: false,
      error: "element_not_in_round",
    });
  });

  it("is for the facilitator only", async () => {
    const roundId = await closedWithMix();
    expect(await settle(p.raters.n1, roundId, p.elements[2], "I decide")).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await settle(p.outsider, roundId, p.elements[2], "I decide")).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("refuses a Delphi round", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    await closedNow(db, p.facilitator, p.projectId, roundId);
    expect(await settle(p.facilitator, roundId, p.elements[0], "Nope")).toEqual({
      ok: false,
      error: "team_round_only",
    });
  });

  it("holds the note rule in the database", async () => {
    const roundId = await closedWithMix();
    await expect(
      db
        .transaction()
        .execute((trx) =>
          trx
            .updateTable("round_element")
            .set({ outcome: "included", settled_at: new Date(), settled_note: null })
            .where("round_id", "=", roundId)
            .where("element_id", "=", p.elements[2])
            .execute(),
        ),
    ).rejects.toThrow("round_element_settled_check");
  });
});

describe("response rate of a Team round (DE6)", () => {
  it("counts started and completed members per group", async () => {
    const roundId = await teamRound();
    for (const element of p.elements) {
      ok(await answer(p.raters.n1, roundId, element, "abstain"));
    }
    ok(await answer(p.raters.t1, roundId, p.elements[0], "include"));
    const rate = ok(
      await responseRate(db, p.facilitator, { projectId: p.projectId, roundId }, now()),
    );
    expect(rate.total).toEqual({ invited: 5, started: 2, completed: 1 });
    const nursing = rate.groups.find((group) => group.groupName === "Nursing");
    expect(nursing).toMatchObject({ invited: 2, started: 1, completed: 1 });
  });
});

describe("the home and the Overview in a Team project", () => {
  it("count a member's answers and the members who answered everything", async () => {
    const roundId = await teamRound();
    for (const element of p.elements) ok(await answer(p.raters.n1, roundId, element, "abstain"));
    ok(await answer(p.raters.t1, roundId, p.elements[0], "include"));
    const mine = await projectOverview(db, p.raters.n1, p.projectId, now());
    expect(mine.ok && mine.value.round).toMatchObject({ id: roundId, elements: 3, rated: 3 });
    const other = await projectOverview(db, p.raters.t1, p.projectId, now());
    expect(other.ok && other.value.round).toMatchObject({ rated: 1 });
    const facts = await overviewFacts(db, p.facilitator, p.projectId, {
      now: new Date(),
      mailConfigured: false,
    });
    expect(facts.ok && facts.value.round).toMatchObject({ id: roundId, completed: 1, raters: 5 });
  });

  it("read the settled outcome in Decided so far", async () => {
    const roundId = await teamRound();
    for (const userId of raters()) ok(await answer(userId, roundId, p.elements[0], "include"));
    ok(await answer(p.raters.n1, roundId, p.elements[1], "discuss", "Unclear"));
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const status = async () => {
      const decided = await decidedSoFar(db, p.facilitator, p.projectId);
      if (!decided.ok) throw new Error(decided.error);
      return new Map(decided.value.elements.map((row) => [row.name, row.status]));
    };
    expect((await status()).get("Systolic pressure")).toBe("included");
    expect((await status()).get("Diastolic pressure")).toBe("no_consensus");
    ok(
      await settleElement(
        db,
        p.facilitator,
        {
          projectId: p.projectId,
          roundId,
          elementId: p.elements[1],
          outcome: "excluded",
          note: "Not needed",
        },
        now(),
      ),
    );
    expect((await status()).get("Diastolic pressure")).toBe("excluded");
  });
});
