// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facts of the project home, the Overview checklist and the projects list (PR4, PR7, PR8,
// Q-SEC-1, Q-ANON-1) on real PostgreSQL, and the brainstorm reminder (EL13).
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { sendBrainstormReminder } from "../elements/brainstorm.ts";
import { answerFirstLook } from "../elements/first-look.ts";
import { setSupport } from "../elements/marks.ts";
import { addElement } from "../elements/queries.ts";
import { acceptInvitationsOnSignIn } from "../invitations/acceptance.ts";
import { invite } from "../invitations/queries.ts";
import type { Mailer } from "../mail.ts";
import { saveRating } from "../rounds/ratings.ts";
import { closedNow, ok, openedRound, panelProject } from "../rounds/test-round.ts";
import { addScopeComment, setModelType, updateScope } from "../scope/queries.ts";
import {
  emailOf,
  facilitatorWithProject,
  groupId,
  insertElement,
  insertImportedElement,
  setPhase,
} from "../test-fixtures.ts";
import { personLeaks, projectWithMembers } from "../test-project-members.ts";
import type { ProjectResult } from "./access.ts";
import { decidedSoFar, listProjectRows, overviewFacts } from "./overview.ts";
import { listGroups, setGroupNamesVisible } from "./queries.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

const DEPS = { now: new Date(), mailConfigured: false };

function value<T>(result: ProjectResult<T>): T {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
}

async function add(userId: string, projectId: string, name: string): Promise<string> {
  return value(
    await addElement(db, userId, {
      projectId,
      name,
      description: "",
      dataType: null,
      cardinality: null,
      source: "",
      prompt: null,
      reference: null,
    }),
  ).elementId;
}

/** Every rater of the panel project gives `score` to `elementId`. */
async function rateAll(
  p: Awaited<ReturnType<typeof panelProject>>,
  roundId: string,
  elementId: string,
  scores: number[],
): Promise<void> {
  const raters = Object.values(p.raters);
  for (const [index, rater] of raters.entries()) {
    ok(
      await saveRating(db, rater, {
        projectId: p.projectId,
        roundId,
        elementId,
        score: scores[index % scores.length] ?? 5,
      }),
    );
  }
}

describe("decidedSoFar (PR8)", () => {
  it("gives each element the outcome of the newest closed round that rated it", async () => {
    const p = await panelProject(db);
    const [included, excluded, open] = p.elements;
    const first = await openedRound(db, p.facilitator, p.projectId);
    await rateAll(p, first, included, [9]);
    await rateAll(p, first, excluded, [1]);
    await rateAll(p, first, open, [1, 9, 5]);
    await closedNow(db, p.facilitator, p.projectId, first);
    const unrated = await insertElement(db, p.projectId, "Comment");

    const before = value(await decidedSoFar(db, p.raters.n1, p.projectId));
    expect(before.elements.map((element) => [element.name, element.status])).toEqual([
      ["Systolic pressure", "included"],
      ["Diastolic pressure", "excluded"],
      ["Cuff size", "no_consensus"],
      ["Comment", "not_rated"],
    ]);
    expect(before.lastClosedRound).toEqual({ id: first, number: 1 });

    // Round 2 rates the open element again; its newest outcome counts, the others keep theirs.
    const second = await openedRound(db, p.facilitator, p.projectId, { elementIds: [open] });
    await rateAll(p, second, open, [9]);
    await closedNow(db, p.facilitator, p.projectId, second);
    const after = value(await decidedSoFar(db, p.raters.n1, p.projectId));
    expect(after.elements.map((element) => element.status)).toEqual([
      "included",
      "excluded",
      "included",
      "not_rated",
    ]);
    expect(after.lastClosedRound).toEqual({ id: second, number: 2 });
    expect(after.elements.some((element) => element.id === unrated)).toBe(true);
  });

  it("leaves out a merged element", async () => {
    const p = await panelProject(db);
    const [kept, merged] = p.elements;
    await db.updateTable("element").set({ merged_into: kept }).where("id", "=", merged).execute();
    const decided = value(await decidedSoFar(db, p.raters.n1, p.projectId));
    expect(decided.elements.map((element) => element.id)).not.toContain(merged);
  });

  it("shows a participant nothing before the rounds' step opens, the facilitator everything", async () => {
    const p = await projectWithMembers(db, "discover");
    await add(p.participant, p.projectId, "Systolic");
    await add(p.otherParticipant, p.projectId, "Diastolic");
    expect(value(await decidedSoFar(db, p.participant, p.projectId))).toEqual({
      elements: [],
      lastClosedRound: null,
    });
    expect(value(await decidedSoFar(db, p.facilitator, p.projectId)).elements).toHaveLength(2);
  });

  it("names no person, and refuses an outsider with not_found (Q-ANON-1, Q-SEC-1)", async () => {
    const p = await projectWithMembers(db, "discover");
    await add(p.participant, p.projectId, "Systolic");
    await setPhase(db, p.projectId, "decide");
    const decided = value(await decidedSoFar(db, p.otherParticipant, p.projectId));
    expect(decided.elements).toHaveLength(1);
    expect(personLeaks(decided, p)).toEqual([]);
    expect(await decidedSoFar(db, p.outsider, p.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("overviewFacts (PR4)", () => {
  it("is the facilitator's only (Q-SEC-1)", async () => {
    const p = await projectWithMembers(db);
    expect(await overviewFacts(db, p.participant, p.projectId, DEPS)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await overviewFacts(db, p.outsider, p.projectId, DEPS)).toEqual({
      ok: false,
      error: "not_found",
    });
  });

  it("counts the scope, the panel and the comments of the scope phase", async () => {
    const p = await projectWithMembers(db);
    const empty = value(await overviewFacts(db, p.facilitator, p.projectId, DEPS));
    expect(empty.scopeWritten).toBe(false);
    expect(empty.modelTypeSet).toBe(false);
    expect(empty.scopeComments).toBe(0);
    // Class D asks 2 clinical, 1 terminology and 2 architecture raters; 2 nurses joined.
    expect(empty.panelMissing).toBe(3);

    value(
      await updateScope(db, p.facilitator, {
        projectId: p.projectId,
        concept: "The pressure of the blood",
        useCases: "",
        outOfScope: "",
      }),
    );
    value(await addScopeComment(db, p.participant, { projectId: p.projectId, body: "Children?" }));
    value(
      await setModelType(db, p.facilitator, { projectId: p.projectId, modelType: "observation" }),
    );
    const invited = await invite(
      db,
      p.facilitator,
      {
        projectId: p.projectId,
        groupId: await groupId(db, p.projectId, "Terminology"),
        email: "terminologist@example.test",
      },
      { baseUrl: "http://localhost:3000", mailer: null, now: new Date() },
    );
    expect(invited.ok).toBe(true);
    const facts = value(await overviewFacts(db, p.facilitator, p.projectId, DEPS));
    expect(facts.scopeWritten).toBe(true);
    expect(facts.modelTypeSet).toBe(true);
    expect(facts.scopeComments).toBe(1);
    // A pending invitation counts toward the panel.
    expect(facts.panelMissing).toBe(2);
  });

  it("counts contributors, duplicates and the reveal of the discover phase without names", async () => {
    const p = await projectWithMembers(db, "discover");
    await db
      .updateTable("project")
      .set({ private_brainstorm: false })
      .where("id", "=", p.projectId)
      .execute();
    const first = await add(p.participant, p.projectId, "Systolic");
    const second = await add(p.participant, p.projectId, "Systolic pressure");
    value(
      await setSupport(db, p.otherParticipant, {
        projectId: p.projectId,
        elementId: first,
        supported: true,
      }),
    );
    await db
      .insertInto("element_same_as")
      .values({
        element_id: first,
        same_as_id: second,
        member_id: (
          await db
            .selectFrom("member")
            .select("id")
            .where("organizationId", "=", p.projectId)
            .where("userId", "=", p.otherParticipant)
            .executeTakeFirstOrThrow()
        ).id,
      })
      .execute();
    const facts = value(
      await overviewFacts(db, p.facilitator, p.projectId, { ...DEPS, mailConfigured: true }),
    );
    expect(facts).toMatchObject({
      participants: 2,
      contributors: 1,
      elements: 2,
      privateBrainstorm: false,
      duplicates: 1,
      importedModels: 0,
      listedFromModels: 0,
      firstLookTotal: 0,
      firstLookFinished: 0,
      groupCheckAsked: false,
      groupChecked: 0,
      mailConfigured: true,
    });
    expect(personLeaks(facts, p)).toEqual([]);
  });

  it("follows the open round and the elements still undecided in the decide phase", async () => {
    const p = await panelProject(db);
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    for (const elementId of p.elements) await rateAll(p, roundId, elementId, [9]);
    const running = value(await overviewFacts(db, p.facilitator, p.projectId, DEPS));
    expect(running.round).toMatchObject({ id: roundId, number: 1, status: "open", raters: 5 });
    expect(running.round?.completed).toBe(5);
    expect(running.undecided).toBe(3);

    await closedNow(db, p.facilitator, p.projectId, roundId);
    const closed = value(await overviewFacts(db, p.facilitator, p.projectId, DEPS));
    expect(closed.round).toBeNull();
    expect(closed.undecided).toBe(0);
    expect(closed.lastClosedRound).toEqual({ id: roundId, number: 1 });
  });
});

describe("listProjectRows (PR2, PR8)", () => {
  it("puts the projects with something waiting first and says what waits", async () => {
    const p = await projectWithMembers(db, "decide");
    // Deciding without a round, the participant has nothing to do.
    const rows = await listProjectRows(db, p.participant, DEPS);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.waiting).toEqual({ kind: "nothing" });

    await setPhase(db, p.projectId, "discover");
    const discovering = await listProjectRows(db, p.participant, DEPS);
    expect(discovering[0]?.waiting).toEqual({
      kind: "task",
      task: {
        kind: "discover",
        added: 0,
        firstLook: { total: 0, answered: 0 },
        groupCheck: { asked: false, done: false },
      },
    });
    const facilitator = await listProjectRows(db, p.facilitator, DEPS);
    expect(facilitator[0]).toMatchObject({ role: "facilitator", phase: "discover" });
    expect(facilitator[0]?.waiting.kind).toBe("checklist");
    expect(personLeaks(facilitator, p)).toEqual([]);
  });

  it("orders a waiting project before a quiet one, by name within each part", async () => {
    const a = await panelProject(db);
    const roundId = await openedRound(db, a.facilitator, a.projectId);
    await db
      .updateTable("organization")
      .set({ name: "Z waiting project" })
      .where("id", "=", a.projectId)
      .execute();
    // A second project, deciding without a round, has the nurse n1 as a participant too.
    const other = await facilitatorWithProject(db, "fac2");
    await setPhase(db, other.projectId, "decide");
    await db
      .updateTable("organization")
      .set({ name: "A quiet project" })
      .where("id", "=", other.projectId)
      .execute();
    const invited = await invite(
      db,
      other.userId,
      {
        projectId: other.projectId,
        groupId: await groupId(db, other.projectId, "Nursing"),
        email: emailOf(a.raters.n1),
      },
      { baseUrl: "http://localhost:3000", mailer: null, now: new Date() },
    );
    expect(invited.ok).toBe(true);
    await acceptInvitationsOnSignIn(db, a.raters.n1, new Date());
    const rows = await listProjectRows(db, a.raters.n1, DEPS);
    expect(rows.map((row) => row.name)).toEqual(["Z waiting project", "A quiet project"]);
    expect(rows[1]?.waiting).toEqual({ kind: "nothing" });
    expect(rows[0]?.waiting).toMatchObject({
      kind: "task",
      task: { kind: "rate", roundId, rated: 0, total: 3 },
    });
  });
});

describe("the group names on the home (PR7)", () => {
  it("are read only when the facilitator allows it", async () => {
    const p = await projectWithMembers(db);
    const hidden = value(await listGroups(db, p.participant, p.projectId));
    expect(hidden.every((group) => group.names === null)).toBe(true);
    value(await setGroupNamesVisible(db, p.facilitator, { projectId: p.projectId, visible: true }));
    const shown = value(await listGroups(db, p.participant, p.projectId));
    expect(shown.find((group) => group.name === "Nursing")?.names).toHaveLength(2);
    expect(JSON.stringify(shown)).not.toContain("@example.test");
  });
});

describe("sendBrainstormReminder (EL13)", () => {
  function mailer() {
    return { send: vi.fn(async () => {}) } satisfies Mailer;
  }

  it("mails every participant without an element, and logs it without an address", async () => {
    const p = await projectWithMembers(db, "discover");
    await add(p.participant, p.projectId, "Systolic");
    const mail = mailer();
    const sent = await sendBrainstormReminder(db, p.facilitator, p.projectId, {
      mailer: mail,
      baseUrl: "http://localhost:3000",
    });
    expect(sent).toEqual({ ok: true, value: { sent: 1 } });
    expect(mail.send).toHaveBeenCalledTimes(1);
    const [message] = mail.send.mock.calls[0] as unknown as [{ to: string; text: string }];
    expect(message.to).toBe(emailOf(p.otherParticipant));
    expect(message.text).toContain(`http://localhost:3000/projects/${p.projectId}/brainstorm`);
    const log = await db
      .selectFrom("activity_log")
      .selectAll()
      .where("action", "=", "brainstorm_reminder_sent")
      .execute();
    expect(log).toHaveLength(1);
    expect(JSON.stringify(log)).not.toContain("@example.test");
  });

  it("mails the participants who have not finished the first look, with its link (EL22)", async () => {
    const p = await projectWithMembers(db, "discover");
    const systolic = await insertImportedElement(db, p.projectId, "Systolic");
    const answered = await answerFirstLook(db, p.participant, {
      projectId: p.projectId,
      elementId: systolic,
      answer: "belongs",
    });
    expect(answered.ok).toBe(true);
    const mail = mailer();
    const sent = await sendBrainstormReminder(db, p.facilitator, p.projectId, {
      mailer: mail,
      baseUrl: "http://localhost:3000",
    });
    expect(sent).toEqual({ ok: true, value: { sent: 1 } });
    const [message] = mail.send.mock.calls[0] as unknown as [{ to: string; text: string }];
    expect(message.to).toBe(emailOf(p.otherParticipant));
    expect(message.text).toContain(`http://localhost:3000/projects/${p.projectId}/first-look`);
  });

  it("refuses without a mailer, outside discover and for a participant", async () => {
    const p = await projectWithMembers(db, "discover");
    const deps = { mailer: mailer(), baseUrl: "http://localhost:3000" };
    expect(
      await sendBrainstormReminder(db, p.facilitator, p.projectId, { ...deps, mailer: null }),
    ).toEqual({ ok: false, error: "mail_not_configured" });
    expect(await sendBrainstormReminder(db, p.participant, p.projectId, deps)).toEqual({
      ok: false,
      error: "forbidden",
    });
    await setPhase(db, p.projectId, "decide");
    expect(await sendBrainstormReminder(db, p.facilitator, p.projectId, deps)).toEqual({
      ok: false,
      error: "reminder_outside_discover",
    });
    expect(deps.mailer.send).not.toHaveBeenCalled();
  });

  it("keeps going when one e-mail fails", async () => {
    const p = await projectWithMembers(db, "discover");
    const mail = {
      send: vi.fn(async ({ to }: { to: string }) => {
        if (to === emailOf(p.participant)) throw new Error("smtp down");
      }),
    };
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const sent = await sendBrainstormReminder(db, p.facilitator, p.projectId, {
      mailer: mail,
      baseUrl: "http://localhost:3000",
    });
    quiet.mockRestore();
    expect(sent).toEqual({ ok: true, value: { sent: 1 } });
    expect(mail.send).toHaveBeenCalledTimes(2);
  });
});
