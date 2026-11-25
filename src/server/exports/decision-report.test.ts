// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The decision report (EX3) on real PostgreSQL: a project with two rounds in the order of the
// ACCORD checklist, the group-size rule (Q-PRIV-3), the response rate of #20, no person in the
// text, and a negative test per role.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { leaveProject } from "../projects/queries.ts";
import { closeRound, createRound, openRound, setChangeClass } from "../rounds/queries.ts";
import { saveRating } from "../rounds/ratings.ts";
import { inDays, ok } from "../rounds/test-round.ts";
import { emailOf, insertElement, joinedParticipant } from "../test-fixtures.ts";
import { type ProjectMembers, personLeaks, projectWithMembers } from "../test-project-members.ts";
import { exportDecisionReport } from "./decision-report.ts";
import type { ExportFile } from "./queries.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

function value(result: { ok: true; value: ExportFile } | { ok: false; error: string }): ExportFile {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
}

/**
 * A decide-phase project: Nursing with four raters, Terminology with three, Patient with one.
 * Round 1 rates three elements and closes; round 2 rates the one without consensus and stays open.
 */
async function seeded() {
  const members = await projectWithMembers(db, "decide");
  const { projectId, facilitator } = members;
  const extra = [
    await joinedParticipant(db, facilitator, projectId, "Nursing", "nursex"),
    await joinedParticipant(db, facilitator, projectId, "Nursing", "nursey"),
    await joinedParticipant(db, facilitator, projectId, "Terminology", "term1"),
    await joinedParticipant(db, facilitator, projectId, "Terminology", "term2"),
    await joinedParticipant(db, facilitator, projectId, "Terminology", "term3"),
    await joinedParticipant(db, facilitator, projectId, "Patient", "patient1"),
    await joinedParticipant(db, facilitator, projectId, "General medicine", "gen1"),
    await joinedParticipant(db, facilitator, projectId, "General medicine", "gen2"),
  ];
  const raters = [members.participant, members.otherParticipant, ...extra];
  await db
    .updateTable("scope_statement")
    .set({ concept: "Blood pressure", use_cases: "Research and teaching", out_of_scope: "Billing" })
    .where("project_id", "=", projectId)
    .execute();
  await setChangeClass(db, facilitator, { projectId, changeClass: "B" });
  const systolic = await insertElement(db, projectId, "Systolic pressure");
  const position = await insertElement(db, projectId, "Body position");
  const cuff = await insertElement(db, projectId, "Cuff | size");
  const merged = await insertElement(db, projectId, "Posture");
  await db.updateTable("element").set({ merged_into: position }).where("id", "=", merged).execute();
  await db
    .updateTable("element")
    .set({
      data_type: "quantity",
      min_occurs: 1,
      max_occurs: 1,
      code_system: "http://loinc.org",
      code: "8480-6",
    })
    .where("id", "=", systolic)
    .execute();
  await db
    .insertInto("detail_proposal")
    .values({ element_id: systolic, kind: "terminology", review_state: "pending" })
    .execute();

  const open = async () => {
    const { roundId } = ok(
      await createRound(db, facilitator, { projectId, closesAt: inDays(1) }, { now: new Date() }),
    );
    ok(
      await openRound(
        db,
        facilitator,
        { projectId, roundId, belowMinimumReason: "No architect available" },
        { now: new Date() },
      ),
    );
    return roundId;
  };
  const rate = async (roundId: string, elementId: string, scores: number[]) => {
    for (const [index, score] of scores.entries()) {
      ok(await saveRating(db, raters[index] ?? "", { projectId, roundId, elementId, score }));
    }
  };
  const round1 = await open();
  await rate(round1, systolic, [9, 9, 8, 8, 9, 9, 8, 8, 9, 9]);
  await rate(round1, position, [1, 2, 1, 2, 1, 2, 1, 2, 1, 2]);
  await rate(round1, cuff, [9, 1, 9, 1, 9, 1, 9, 1, 9, 1]);
  const closedAt = inDays(2);
  ok(await closeRound(db, facilitator, { projectId, roundId: round1 }, { now: closedAt }));
  // The second round opens in the future so the first is long closed when the report is made.
  const round2 = await open();
  void round2;
  return {
    members: { ...members, memberIds: members.memberIds } as ProjectMembers,
    raters,
    closedAt,
    extra,
  };
}

const NOW = inDays(3);

describe("exportDecisionReport (EX3)", () => {
  it("holds every part in the order of the ACCORD checklist", async () => {
    const { members } = await seeded();
    const file = value(await exportDecisionReport(db, members.facilitator, members.projectId, NOW));
    expect(file.filename).toMatch(/^decision-report-\d{4}-\d{2}-\d{2}\.md$/);
    expect(file.mediaType).toBe("text/markdown; charset=utf-8");
    const headings = file.content.split("\n").filter((line) => line.startsWith("## "));
    expect(headings).toEqual([
      "## Aim and scope",
      "## Panel",
      "## Consensus method and rules",
      "## Rounds and response",
      "## Outcome per element",
      "## Items removed or changed",
    ]);
    expect(file.content.split("\n")[0]).toBe(
      "# Decision report: Blood pressure (consensus exercise, e-Delphi rating rounds)",
    );
    expect(file.content).toContain("**Concept:** Blood pressure");
    expect(file.content).toContain("**Out of scope:** Billing");
    expect(file.content).toContain("### Round 1");
    expect(file.content).toContain("### Round 2");
    expect(file.content).toContain("at least 70% of the scores are 7 to 9");
    expect(file.content).toContain("| Systolic pressure | included | 9 | 10 |");
    expect(file.content).toContain("| Body position | excluded |");
    expect(file.content).toContain("| Cuff \\| size | no consensus |");
    expect(file.content).toContain("- Body position: excluded in round 1.");
    expect(file.content).toContain("- Posture: merged into Body position.");
  });

  it("names a group only from 3 raters and merges the rest (Q-PRIV-3)", async () => {
    const { members } = await seeded();
    const file = value(await exportDecisionReport(db, members.facilitator, members.projectId, NOW));
    expect(file.content).toContain("| Nursing | clinical | 4 |");
    expect(file.content).toContain("| Terminology | terminology | 3 |");
    expect(file.content).not.toContain("| Patient |");
    expect(file.content).not.toContain("| General medicine |");
    expect(file.content).toContain("| Other groups (a group of fewer than 3 is not named) |");
    expect(file.content).toContain(
      "| Other groups (a group of fewer than 3 is not named) | 3 | 3 | 3 |",
    );
  });

  it("keeps the response rate of the closed round after a participant leaves (#20)", async () => {
    const { members, extra } = await seeded();
    const before = value(
      await exportDecisionReport(db, members.facilitator, members.projectId, NOW),
    );
    expect(before.content).toContain("Of 10 invited, 10 started and 10 completed.");
    // A terminologist leaves after round 1 closed; the closed round still counts them.
    const leaving = extra[2] ?? "";
    expect((await leaveProject(db, leaving, members.projectId)).ok).toBe(true);
    await db
      .updateTable("team_member_left")
      .set({ left_at: inDays(2.5) })
      .where("user_id", "=", leaving)
      .execute();
    const after = value(
      await exportDecisionReport(db, members.facilitator, members.projectId, NOW),
    );
    const round1 = (text: string) => text.slice(text.indexOf("## Rounds and response"));
    expect(round1(after.content)).toContain("Of 10 invited, 10 started and 10 completed.");
    expect(round1(after.content)).toContain("| Terminology | 3 | 3 | 3 |");
    // Now the terminologists are 2 and fall under the rule with the other small groups.
    expect(after.content.slice(0, after.content.indexOf("## Consensus"))).not.toContain(
      "| Terminology |",
    );
  });

  it("marks open codes and gives the detail of an element", async () => {
    const { members } = await seeded();
    const file = value(await exportDecisionReport(db, members.facilitator, members.projectId, NOW));
    expect(file.content).toContain(
      "| Systolic pressure | included | quantity | 1..1 |  | http://loinc.org\\|8480-6 (open) |",
    );
  });

  it("names no person and holds no rating code (Q-PRIV-1)", async () => {
    const { members, raters } = await seeded();
    const file = value(await exportDecisionReport(db, members.facilitator, members.projectId, NOW));
    expect(personLeaks(file.content, members)).toEqual([]);
    for (const user of raters) {
      expect(file.content).not.toContain(user);
      expect(file.content).not.toContain(emailOf(user));
    }
    const codes = await db
      .selectFrom("rating_code")
      .select("id")
      .where("project_id", "=", members.projectId)
      .execute();
    expect(codes.length).toBeGreaterThan(0);
    for (const code of codes) expect(file.content).not.toContain(code.id);
  });

  it("logs the export with ids only (AD2)", async () => {
    const { members } = await seeded();
    value(await exportDecisionReport(db, members.facilitator, members.projectId, NOW));
    const rows = await db
      .selectFrom("activity_log")
      .selectAll()
      .where("project_id", "=", members.projectId)
      .where("action", "=", "export_decision_report")
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: members.facilitator,
      target_type: "project",
      target_id: members.projectId,
    });
  });

  it("refuses a participant with forbidden, an outsider with not_found, and logs nothing", async () => {
    const { members } = await seeded();
    expect(await exportDecisionReport(db, members.participant, members.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await exportDecisionReport(db, members.outsider, members.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
    const logged = await db
      .selectFrom("activity_log")
      .select("id")
      .where("action", "=", "export_decision_report")
      .execute();
    expect(logged).toEqual([]);
  });

  it("writes a report for a project without rounds", async () => {
    const members = await projectWithMembers(db, "scope");
    const file = value(await exportDecisionReport(db, members.facilitator, members.projectId, NOW));
    expect(file.content).toContain("No round has been opened.");
    expect(file.content).toContain("**Concept:** not stated");
  });
});
