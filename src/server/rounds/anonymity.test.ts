// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Anonymity of ratings on the server (ADR 0005, DE4, Q-ANON-1, Q-PRIV-2): only rater-link.ts
// reads the code-to-member table, no response links a rating to a person unless the round
// allows it, and the activity log of a full round holds ids only.
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { setGroupNamesVisible, setRaterGroup } from "../projects/queries.ts";
import { groupId } from "../test-fixtures.ts";
import { addProposal, myProposals, roundProposals } from "./proposals.ts";
import {
  closeRound,
  createRound,
  getRound,
  listRounds,
  openRound,
  panelStatus,
  updateRound,
} from "./queries.ts";
import { clearRating, myRatings, ratingsByParticipant, saveRating } from "./ratings.ts";
import { responseRate, roundResults } from "./results.ts";
import { inDays, type PanelProject, panelProject } from "./test-round.ts";

const SRC = fileURLToPath(new URL("../..", import.meta.url));

/** The one module that may read rating_code (ADR 0005). */
const READER = "server/rounds/rater-link.ts";

/** Modules that only create a participant's code when they join. */
const CREATORS = ["server/projects/queries.ts", "server/invitations/acceptance.ts"];

/** The schema itself: migrations and the generated types. */
const SCHEMA = /^server\/db\/(migrations\/|schema\.gen\.ts$)/;

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(ts|tsx)$/.test(entry.name))
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((path) => !/\.test\.tsx?$/.test(path) && !/\/test-[^/]+\.ts$/.test(path));
}

// `\b` keeps `rating_code_id`, the column every rating carries, out of the match.
const TABLE = /\brating_code\b/g;

describe("the code-to-member table (ADR 0005)", () => {
  it("is read by rater-link.ts only; other modules only insert a code", async () => {
    const offenders: string[] = [];
    for (const path of await sourceFiles(SRC)) {
      const name = relative(SRC, path);
      if (name === READER || SCHEMA.test(name)) continue;
      const text = await readFile(path, "utf8");
      const uses = text.match(TABLE)?.length ?? 0;
      if (uses === 0) continue;
      const inserts = text.match(/insertInto\("rating_code"\)/g)?.length ?? 0;
      if (!CREATORS.includes(name) || uses !== inserts) offenders.push(name);
    }
    expect(offenders).toEqual([]);
  });

  it("is read by exactly two queries in rater-link.ts", async () => {
    const text = await readFile(join(SRC, READER), "utf8");
    const reads = text.match(/(selectFrom|[a-zA-Z]*[jJ]oin)\("rating_code"/g) ?? [];
    expect(reads).toHaveLength(2);
    const exported = text.match(/^export async function \w+/gm) ?? [];
    expect(exported).toEqual([
      "export async function ownRatingCode",
      "export async function ratingsByParticipantQuery",
    ]);
  });
});

describe("responses with the rater setting off (DE4, Q-ANON-1)", () => {
  let db: Kysely<DB>;
  let p: PanelProject;

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

  /** Every id, address and name that would link a rating to a person. */
  async function identifiers(): Promise<string[]> {
    const members = await db
      .selectFrom("member")
      .innerJoin("user", "user.id", "member.userId")
      .select(["member.id as memberId", "user.id as userId", "user.email", "user.name"])
      .where("member.organizationId", "=", p.projectId)
      .execute();
    const codes = await db.selectFrom("rating_code").select("id").execute();
    return [
      ...members.flatMap((m) => [m.memberId, m.userId, m.email, m.name]),
      ...codes.map((c) => c.id),
    ].filter((value) => value !== "");
  }

  function leaks(responses: unknown[], forbidden: readonly string[]): string[] {
    const text = JSON.stringify(responses);
    return forbidden.filter((value) => text.includes(value));
  }

  /** A full round: setup, opening, ratings with reasons, closing, and round 2 opened. */
  async function fullRound(responses: unknown[]) {
    const f = p.facilitator;
    const projectId = p.projectId;
    const t = () => ({ now: new Date() });
    const created = await createRound(db, f, { projectId, closesAt: inDays(1) }, t());
    responses.push(created);
    if (!created.ok) throw new Error(created.error);
    const { roundId } = created.value;
    const input = { projectId, roundId };
    responses.push(await updateRound(db, f, { ...input, rule: { agreementPct: 75 } }, t()));
    responses.push(await panelStatus(db, f, projectId));
    responses.push(await openRound(db, f, input, t()));
    let score = 1;
    for (const rater of Object.values(p.raters)) {
      for (const elementId of p.elements) {
        responses.push(
          await saveRating(db, rater, {
            ...input,
            elementId,
            score: score++ % 10 || null,
            reason: `Invented reason ${score}`,
          }),
        );
      }
    }
    responses.push(await clearRating(db, p.raters.a2, { ...input, elementId: p.elements[2] }));
    for (const [name, rater] of Object.entries(p.raters)) {
      responses.push(
        await addProposal(db, rater, { ...input, name: `Proposal ${name}`, description: "" }),
      );
    }
    responses.push(await roundProposals(db, f, input));
    responses.push(await responseRate(db, f, input, t()));
    responses.push(await ratingsByParticipant(db, f, input));
    responses.push(await closeRound(db, f, input, { now: inDays(2) }));
    responses.push(await roundResults(db, f, input, t()));
    const next = await createRound(db, f, { projectId, closesAt: inDays(1) }, t());
    if (!next.ok) throw new Error(next.error);
    const nextInput = { projectId, roundId: next.value.roundId };
    responses.push(next, await openRound(db, f, nextInput, t()));
    return { input, nextInput };
  }

  it("finds no member, user or rating code in any response the facilitator gets", async () => {
    const facilitatorResponses: unknown[] = [];
    const { input, nextInput } = await fullRound(facilitatorResponses);
    const f = p.facilitator;
    const t = { now: new Date() };
    for (const round of [input, nextInput]) {
      facilitatorResponses.push(
        await getRound(db, f, round, t),
        await myRatings(db, f, round, t),
        await responseRate(db, f, round, t),
        await ratingsByParticipant(db, f, round),
        await roundProposals(db, f, round),
      );
    }
    facilitatorResponses.push(await listRounds(db, f, p.projectId, t));
    expect(await ratingsByParticipant(db, f, input)).toEqual({
      ok: false,
      error: "raters_hidden",
    });
    const forbidden = await identifiers();
    expect(forbidden.length).toBeGreaterThan(15);
    expect(leaks(facilitatorResponses, forbidden)).toEqual([]);
  });

  it("finds no other participant and no rating code in a participant's responses", async () => {
    const { input, nextInput } = await fullRound([]);
    const t = { now: new Date() };
    const own: unknown[] = [];
    for (const round of [input, nextInput]) {
      own.push(
        await getRound(db, p.raters.n1, round, t),
        await myRatings(db, p.raters.n1, round, t),
        await myProposals(db, p.raters.n1, round),
      );
    }
    own.push(await roundResults(db, p.raters.n1, input, t));
    own.push(await listRounds(db, p.raters.n1, p.projectId, t));
    expect(leaks(own, await identifiers())).toEqual([]);
    // A participant sees their own proposal only (DE16).
    expect(JSON.stringify(own)).toContain("Proposal n1");
    expect(leaks(own, ["Proposal n2", "Proposal t1", "Proposal a1", "Proposal a2"])).toEqual([]);
    // The reasons of round 1 come without author (DE8).
    const mine = await myRatings(db, p.raters.n1, nextInput, t);
    expect(mine.ok && mine.value.elements.some((e) => (e.previous?.reasons.length ?? 0) > 0)).toBe(
      true,
    );
  });

  it("keeps a rating facilitator anonymous to participants, with group names shown (DE14, PR7)", async () => {
    const f = p.facilitator;
    const projectId = p.projectId;
    await db
      .updateTable("user")
      .set({ name: "Invented Facilitator" })
      .where("id", "=", f)
      .execute();
    await setGroupNamesVisible(db, f, { projectId, visible: true });
    await setRaterGroup(db, f, { projectId, groupId: await groupId(db, projectId, "Nursing") });
    const { input, nextInput } = await fullRound([]);
    const t = { now: new Date() };
    for (const elementId of p.elements) {
      const saved = await saveRating(db, f, { ...nextInput, elementId, score: 5, reason: "Mine" });
      expect(saved.ok).toBe(true);
    }
    const own: unknown[] = [];
    for (const round of [input, nextInput]) {
      own.push(
        await getRound(db, p.raters.n1, round, t),
        await myRatings(db, p.raters.n1, round, t),
      );
    }
    own.push(await roundResults(db, p.raters.n1, input, t));
    own.push(await listRounds(db, p.raters.n1, p.projectId, t));
    const forbidden = await identifiers();
    expect(forbidden).toContain("Invented Facilitator");
    expect(leaks(own, forbidden)).toEqual([]);
    // With the rater setting off, the facilitator's own view links no rating to anyone either.
    expect(await ratingsByParticipant(db, f, nextInput)).toEqual({
      ok: false,
      error: "raters_hidden",
    });
    expect(leaks([await responseRate(db, f, nextInput, t)], forbidden)).toEqual([]);
  });

  it("keeps scores, reasons, element names and personal data out of the activity log (Q-PRIV-2)", async () => {
    await fullRound([]);
    const rows = await db.selectFrom("activity_log").selectAll().execute();
    expect(rows.some((row) => row.action === "rating_saved")).toBe(true);
    const text = JSON.stringify(rows);
    const elementNames = await db.selectFrom("element").select("name").execute();
    const users = await db.selectFrom("user").select(["email", "name"]).execute();
    const forbidden = [
      "Invented reason",
      ...elementNames.map((e) => e.name),
      ...users.flatMap((u) => [u.email, u.name]).filter((v) => v !== ""),
    ];
    expect(forbidden.filter((value) => text.includes(value))).toEqual([]);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual([
        "action",
        "actor_user_id",
        "id",
        "occurred_at",
        "project_id",
        "target_id",
        "target_type",
      ]);
    }
  });
});
