// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The phase-bound access of PR9 and PR10 on real PostgreSQL: a participant writes only in the
// step the phase opens and reads nothing of a step that has not started; the facilitator works
// ahead, but opens a round, reveals the board and leaves the decide phase only by the rules.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProjectPhase } from "@/lib/project-phases";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { revealBoard } from "../elements/brainstorm.ts";
import {
  addElement,
  addElementComment,
  listElementComments,
  listElements,
  listOwnElements,
} from "../elements/queries.ts";
import { addElementInput } from "../elements/schemas.ts";
import { myProposals } from "../rounds/proposals.ts";
import { closeRound, createRound, getRound, listRounds, openRound } from "../rounds/queries.ts";
import { myRatings } from "../rounds/ratings.ts";
import { roundResults } from "../rounds/results.ts";
import {
  closedNow,
  inDays,
  ok,
  openedRound,
  type PanelProject,
  panelProject,
} from "../rounds/test-round.ts";
import { addScopeComment, listScopeComments } from "../scope/queries.ts";
import { groupId, setPhase } from "../test-fixtures.ts";
import { type ProjectMembers, projectWithMembers } from "../test-project-members.ts";
import { movePhase } from "./phase.ts";
import { setRaterGroup } from "./queries.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

const LATER_THAN_SCOPE: ProjectPhase[] = ["discover", "decide", "handoff"];
const OUTSIDE_DISCOVER: ProjectPhase[] = ["scope", "decide", "handoff"];

async function logCount(projectId: string): Promise<number> {
  const rows = await db
    .selectFrom("activity_log")
    .select("id")
    .where("project_id", "=", projectId)
    .execute();
  return rows.length;
}

/** The value of a project result that must succeed. */
function must<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
}

function addAs(m: ProjectMembers, userId: string, name: string) {
  return addElement(db, userId, addElementInput.parse({ projectId: m.projectId, name }));
}

describe("scope comments (PR9)", () => {
  it("take a participant's comment in the scope phase", async () => {
    const m = await projectWithMembers(db, "scope");
    const added = await addScopeComment(db, m.participant, { projectId: m.projectId, body: "Hi" });
    expect(added.ok).toBe(true);
  });

  it.each(LATER_THAN_SCOPE)(
    "refuse a participant's comment in %s with phase_closed",
    async (phase) => {
      const m = await projectWithMembers(db, phase);
      const before = await logCount(m.projectId);
      expect(
        await addScopeComment(db, m.participant, { projectId: m.projectId, body: "Late" }),
      ).toEqual({ ok: false, error: "phase_closed" });
      expect(await logCount(m.projectId)).toBe(before);
      const comments = await listScopeComments(db, m.participant, m.projectId);
      expect(comments).toEqual({ ok: true, value: [] });
    },
  );

  it("take the facilitator's comment in a later phase (PR10)", async () => {
    const m = await projectWithMembers(db, "decide");
    const added = await addScopeComment(db, m.facilitator, { projectId: m.projectId, body: "Hi" });
    expect(added.ok).toBe(true);
  });
});

describe("adding elements (PR9, PR10)", () => {
  it("takes a participant's element in the discover phase", async () => {
    const m = await projectWithMembers(db, "discover");
    expect((await addAs(m, m.participant, "Systolic")).ok).toBe(true);
  });

  it.each(OUTSIDE_DISCOVER)(
    "refuses a participant's element in %s with phase_closed",
    async (phase) => {
      const m = await projectWithMembers(db, phase);
      const before = await logCount(m.projectId);
      expect(await addAs(m, m.participant, "Systolic")).toEqual({
        ok: false,
        error: "phase_closed",
      });
      expect(await logCount(m.projectId)).toBe(before);
      const elements = await db
        .selectFrom("element")
        .select("id")
        .where("project_id", "=", m.projectId)
        .execute();
      expect(elements).toEqual([]);
    },
  );

  it.each(OUTSIDE_DISCOVER)(
    "takes the facilitator's element in %s, to prepare ahead",
    async (phase) => {
      const m = await projectWithMembers(db, phase);
      expect((await addAs(m, m.facilitator, "Systolic")).ok).toBe(true);
    },
  );
});

describe("element comments (PR9)", () => {
  /** An element of the facilitator's on a board revealed in discover, then the project in `phase`. */
  async function elementIn(phase: ProjectPhase) {
    const m = await projectWithMembers(db, phase === "scope" ? "scope" : "discover");
    const added = await addAs(m, m.facilitator, "Systolic");
    if (!added.ok) throw new Error(added.error);
    if (phase !== "scope") {
      must(await revealBoard(db, m.facilitator, m.projectId));
      await setPhase(db, m.projectId, phase);
    }
    return { m, elementId: added.value.elementId };
  }

  it("take a participant's comment in the discover phase", async () => {
    const { m, elementId } = await elementIn("discover");
    const added = await addElementComment(db, m.participant, {
      projectId: m.projectId,
      elementId,
      body: "A comment",
    });
    expect(added.ok).toBe(true);
  });

  it.each(["decide", "handoff"] as const)(
    "refuse a participant's comment in %s with phase_closed, while the comments stay readable",
    async (phase) => {
      const { m, elementId } = await elementIn(phase);
      const before = await logCount(m.projectId);
      expect(
        await addElementComment(db, m.participant, {
          projectId: m.projectId,
          elementId,
          body: "Late",
        }),
      ).toEqual({ ok: false, error: "phase_closed" });
      expect(await logCount(m.projectId)).toBe(before);
      expect(
        await listElementComments(db, m.participant, { projectId: m.projectId, elementId }),
      ).toEqual({ ok: true, value: [] });
    },
  );

  it("find no element for a participant in the scope phase", async () => {
    const { m, elementId } = await elementIn("scope");
    expect(
      await addElementComment(db, m.participant, {
        projectId: m.projectId,
        elementId,
        body: "Early",
      }),
    ).toEqual({ ok: false, error: "element_not_found" });
  });

  it("take the facilitator's comment in the decide phase (PR10)", async () => {
    const { m, elementId } = await elementIn("decide");
    const added = await addElementComment(db, m.facilitator, {
      projectId: m.projectId,
      elementId,
      body: "A note",
    });
    expect(added.ok).toBe(true);
  });
});

describe("reading the board before its step (PR9)", () => {
  it("gives a participant in the scope phase no element and no comment", async () => {
    const m = await projectWithMembers(db, "scope");
    const added = await addAs(m, m.facilitator, "Systolic");
    if (!added.ok) throw new Error(added.error);
    const elementId = added.value.elementId;
    must(
      await addElementComment(db, m.facilitator, {
        projectId: m.projectId,
        elementId,
        body: "Prepared",
      }),
    );
    expect(await listElements(db, m.participant, m.projectId)).toEqual({ ok: true, value: [] });
    expect(await listOwnElements(db, m.participant, m.projectId)).toEqual({
      ok: true,
      value: [],
    });
    expect(
      await listElementComments(db, m.participant, { projectId: m.projectId, elementId }),
    ).toEqual({ ok: false, error: "element_not_found" });
  });

  it("shows the facilitator the prepared board in the scope phase (PR10)", async () => {
    const m = await projectWithMembers(db, "scope");
    must(await addAs(m, m.facilitator, "Systolic"));
    const list = await listElements(db, m.facilitator, m.projectId);
    expect(list.ok && list.value.map((element) => element.name)).toEqual(["Systolic"]);
  });

  it("shows the participant the board again once the discover phase starts", async () => {
    const m = await projectWithMembers(db, "scope");
    must(await addAs(m, m.facilitator, "Systolic"));
    await setPhase(db, m.projectId, "discover");
    // The private step of the brainstorm hides another's element until the reveal (EL13).
    must(await revealBoard(db, m.facilitator, m.projectId));
    const list = await listElements(db, m.participant, m.projectId);
    expect(list.ok && list.value.map((element) => element.name)).toEqual(["Systolic"]);
  });
});

describe("rounds and the phase (PR9, PR10)", () => {
  let p: PanelProject;

  beforeEach(async () => {
    p = await panelProject(db, "discover");
  });

  async function draftRound(): Promise<string> {
    const created = await createRound(
      db,
      p.facilitator,
      { projectId: p.projectId, closesAt: inDays(1) },
      { now: new Date() },
    );
    return ok(created).roundId;
  }

  it.each(["scope", "discover", "handoff"] as const)(
    "refuses to open a round in %s with round_outside_decide and keeps it a draft",
    async (phase) => {
      await setPhase(db, p.projectId, phase);
      const roundId = await draftRound();
      expect(
        await openRound(
          db,
          p.facilitator,
          { projectId: p.projectId, roundId },
          { now: new Date() },
        ),
      ).toEqual({ ok: false, error: "round_outside_decide" });
      const round = await db
        .selectFrom("round")
        .select("opened_at")
        .where("id", "=", roundId)
        .executeTakeFirstOrThrow();
      expect(round.opened_at).toBeNull();
    },
  );

  it("lets the facilitator set up a round ahead and open it in the decide phase", async () => {
    const roundId = await draftRound();
    await setPhase(db, p.projectId, "decide");
    const opened = await openRound(
      db,
      p.facilitator,
      { projectId: p.projectId, roundId },
      { now: new Date() },
    );
    expect(opened.ok).toBe(true);
  });

  it("gives a participant no round before the decide phase, and every member after it", async () => {
    await setPhase(db, p.projectId, "decide");
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    await closedNow(db, p.facilitator, p.projectId, roundId);
    // Back to discover, for example to add elements a round showed missing (PR4).
    must(
      await movePhase(db, p.facilitator, {
        projectId: p.projectId,
        from: "decide",
        direction: "previous",
      }),
    );
    const now = { now: new Date() };
    const input = { projectId: p.projectId, roundId };
    const rater = p.raters.n1;
    expect(await listRounds(db, rater, p.projectId, now)).toEqual({ ok: true, value: [] });
    const notFound = { ok: false, error: "round_not_found" };
    expect(await getRound(db, rater, input, now)).toEqual(notFound);
    expect(await roundResults(db, rater, input, now)).toEqual(notFound);
    expect(await myRatings(db, rater, input, now)).toEqual(notFound);
    expect(await myProposals(db, rater, input)).toEqual(notFound);

    const facilitatorRounds = await listRounds(db, p.facilitator, p.projectId, now);
    expect(facilitatorRounds.ok && facilitatorRounds.value.map((round) => round.id)).toEqual([
      roundId,
    ]);
    expect((await getRound(db, p.facilitator, input, now)).ok).toBe(true);

    await setPhase(db, p.projectId, "handoff");
    const later = await listRounds(db, rater, p.projectId, now);
    expect(later.ok && later.value.map((round) => round.id)).toEqual([roundId]);
    expect((await roundResults(db, rater, input, now)).ok).toBe(true);
  });

  it("keeps the rounds visible to a facilitator who joined a group to rate", async () => {
    const nursing = await groupId(db, p.projectId, "Nursing");
    must(await setRaterGroup(db, p.facilitator, { projectId: p.projectId, groupId: nursing }));
    const roundId = await draftRound();
    const rounds = await listRounds(db, p.facilitator, p.projectId, { now: new Date() });
    expect(rounds.ok && rounds.value.map((round) => round.id)).toEqual([roundId]);
  });

  describe("leaving the decide phase", () => {
    let roundId: string;

    beforeEach(async () => {
      await setPhase(db, p.projectId, "decide");
      roundId = await openedRound(db, p.facilitator, p.projectId);
    });

    it.each(["next", "previous"] as const)(
      "is refused (%s) with round_still_open while a round is open",
      async (direction) => {
        expect(
          await movePhase(db, p.facilitator, { projectId: p.projectId, from: "decide", direction }),
        ).toEqual({ ok: false, error: "round_still_open" });
        const project = await db
          .selectFrom("project")
          .select("phase")
          .where("id", "=", p.projectId)
          .executeTakeFirstOrThrow();
        expect(project.phase).toBe("decide");
      },
    );

    it("is refused while the closing date has passed and the round is not closed yet", async () => {
      // An opened round's closing date is fixed (DE2), so this round closes one second from now.
      await closedNow(db, p.facilitator, p.projectId, roundId);
      const created = await createRound(
        db,
        p.facilitator,
        { projectId: p.projectId, closesAt: new Date(Date.now() + 1000) },
        { now: new Date() },
      );
      const shortRound = ok(created).roundId;
      ok(
        await openRound(
          db,
          p.facilitator,
          { projectId: p.projectId, roundId: shortRound },
          { now: new Date() },
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, 1100));
      const listed = await listRounds(db, p.facilitator, p.projectId, { now: new Date() });
      expect(listed.ok && listed.value[0]?.status).toBe("awaiting_close");
      expect(
        await movePhase(db, p.facilitator, {
          projectId: p.projectId,
          from: "decide",
          direction: "next",
        }),
      ).toEqual({ ok: false, error: "round_still_open" });
    });

    it("is allowed once the round is closed", async () => {
      ok(
        await closeRound(
          db,
          p.facilitator,
          { projectId: p.projectId, roundId },
          { now: inDays(2) },
        ),
      );
      expect(
        await movePhase(db, p.facilitator, {
          projectId: p.projectId,
          from: "decide",
          direction: "next",
        }),
      ).toEqual({ ok: true, value: { phase: "handoff" } });
    });
  });
});

describe("revealing the board (PR10, EL13)", () => {
  it.each(["scope", "decide", "handoff"] as const)(
    "is refused in %s with reveal_outside_discover",
    async (phase) => {
      const m = await projectWithMembers(db, phase);
      expect(await revealBoard(db, m.facilitator, m.projectId)).toEqual({
        ok: false,
        error: "reveal_outside_discover",
      });
      const project = await db
        .selectFrom("project")
        .select("board_revealed_at")
        .where("id", "=", m.projectId)
        .executeTakeFirstOrThrow();
      expect(project.board_revealed_at).toBeNull();
    },
  );

  it("is done in the discover phase", async () => {
    const m = await projectWithMembers(db, "discover");
    expect(await revealBoard(db, m.facilitator, m.projectId)).toEqual({ ok: true, value: null });
  });
});
