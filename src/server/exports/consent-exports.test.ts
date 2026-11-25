// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The exports of a Team project (DE20, ADR 0023) on real PostgreSQL: the answers export names
// people, the elements CSV and the mind map follow the settled outcomes, and the decision report
// states the consent rule and lists the settled elements with their notes, without a name.
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ConsentAnswer } from "@/lib/consent";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import { saveConsent, settleElement } from "../rounds/consent.ts";
import {
  closedNow,
  ok,
  openedRound,
  type PanelProject,
  panelProject,
} from "../rounds/test-round.ts";
import { exportDecisionReport } from "./decision-report.ts";
import type { ExportFile } from "./queries.ts";
import { exportElementsCsv, exportMindMap, exportRatingsCsv } from "./queries.ts";

let db: Kysely<DB>;
let p: PanelProject;

beforeEach(async () => {
  db = await createTestDb();
  p = await panelProject(db);
  await db.updateTable("project").set({ mode: "team" }).where("id", "=", p.projectId).execute();
  const names = { n1: "Ann", n2: "Bo", t1: "Cas", a1: "Dee", a2: "Eli" } as const;
  for (const [key, userId] of Object.entries(p.raters)) {
    await db
      .updateTable("user")
      .set({ name: names[key as keyof typeof names] })
      .where("id", "=", userId)
      .execute();
  }
});

afterEach(async () => {
  await db.destroy();
});

function value(result: { ok: true; value: ExportFile } | { ok: false; error: string }): ExportFile {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
}

/** The rows of a CSV file of plain cells (no comma or line break inside a cell). */
function rowsOf(content: string, separator = ","): string[][] {
  return content
    .replace("﻿", "")
    .trim()
    .split(/\r?\n/)
    .map((line) => line.split(separator).map((cell) => cell.replace(/^"|"$/g, "")));
}

function answer(
  userId: string,
  roundId: string,
  elementId: string,
  a: ConsentAnswer,
  why?: string,
) {
  return saveConsent(db, userId, {
    projectId: p.projectId,
    roundId,
    elementId,
    answer: a,
    ...(why === undefined ? {} : { reason: why }),
  });
}

/** Round 1 closed: the first element in, the second out, the third to discuss and settled out. */
async function closedRoundWithSettling(): Promise<string> {
  const roundId = await openedRound(db, p.facilitator, p.projectId);
  const [first, second, third] = p.elements;
  for (const userId of Object.values(p.raters)) {
    ok(await answer(userId, roundId, first, "include"));
    ok(await answer(userId, roundId, second, "leave_out", "Out of scope"));
  }
  ok(await answer(p.raters.n1, roundId, third, "include"));
  ok(await answer(p.raters.n2, roundId, third, "discuss", "Unclear definition"));
  await closedNow(db, p.facilitator, p.projectId, roundId);
  ok(
    await settleElement(
      db,
      p.facilitator,
      {
        projectId: p.projectId,
        roundId,
        elementId: third,
        outcome: "excluded",
        note: "Covered by the cuff element",
      },
      { now: new Date() },
    ),
  );
  return roundId;
}

describe("the answers export of a Team project", () => {
  it("names people, has no participant code and holds only closed rounds", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await answer(p.raters.n1, roundId, p.elements[0], "include"));
    const open = value(await exportRatingsCsv(db, p.facilitator, p.projectId));
    expect(rowsOf(open.content)).toHaveLength(1);

    await closedNow(db, p.facilitator, p.projectId, roundId);
    const file = value(await exportRatingsCsv(db, p.facilitator, p.projectId));
    const [header, ...rows] = rowsOf(file.content);
    expect(header).toEqual([
      "participant",
      "stakeholder_group",
      "round",
      "element",
      "answer",
      "reason",
    ]);
    expect(file.filename).toMatch(/^answers-/);
    expect(rows).toEqual([["Ann", "Nursing", "1", "Systolic pressure", "include", ""]]);
    expect(file.content).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("holds each answer with its name, group and reason", async () => {
    await closedRoundWithSettling();
    const file = value(await exportRatingsCsv(db, p.facilitator, p.projectId));
    const rows = rowsOf(file.content);
    const bo = ["Bo", "Nursing", "1", "Cuff size", "discuss", "Unclear definition"];
    expect(rows).toContainEqual(bo);
    expect(rows).toContainEqual([
      "Cas",
      "Terminology",
      "1",
      "Diastolic pressure",
      "leave_out",
      "Out of scope",
    ]);
    const semicolon = value(await exportRatingsCsv(db, p.facilitator, p.projectId, "semicolon"));
    expect(semicolon.filename).toMatch(/^answers-semicolon-/);
    expect(rowsOf(semicolon.content, ";")).toContainEqual(bo);
  });

  it("is for the facilitator only", async () => {
    await closedRoundWithSettling();
    expect(await exportRatingsCsv(db, p.raters.n1, p.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await exportRatingsCsv(db, p.outsider, p.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});

describe("outcomes in the other exports", () => {
  it("writes the settled outcome in the elements CSV and keeps the element in the mind map", async () => {
    await closedRoundWithSettling();
    const csv = value(await exportElementsCsv(db, p.facilitator, p.projectId)).content;
    const [header = [], ...lines] = rowsOf(csv);
    const column = header.indexOf("round_1_outcome");
    const outcomeOf = (name: string) => lines.find((line) => line[0] === name)?.[column];
    expect(outcomeOf("Systolic pressure")).toBe("included");
    expect(outcomeOf("Diastolic pressure")).toBe("excluded");
    expect(outcomeOf("Cuff size")).toBe("excluded");
    const map = value(await exportMindMap(db, p.facilitator, p.projectId)).content;
    expect(map).toContain("Systolic pressure");
    expect(map).not.toContain("Cuff size");
  });

  it("writes an unsettled To discuss element as no_consensus", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await answer(p.raters.n1, roundId, p.elements[0], "discuss", "Unclear"));
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const csv = value(await exportElementsCsv(db, p.facilitator, p.projectId)).content;
    expect(csv).toContain("no_consensus");
  });
});

describe("the decision report of a Team project", () => {
  it("states the consent rule and lists the settled elements with their notes", async () => {
    await closedRoundWithSettling();
    const text = value(await exportDecisionReport(db, p.facilitator, p.projectId)).content;
    expect(text).toContain("team consent rounds");
    expect(text).toContain("by consent");
    expect(text).not.toContain("e-Delphi");
    expect(text).not.toContain("Scores run from");
    expect(text).toContain("Settled after the discussion:");
    expect(text).toContain("- Cuff size: excluded. Covered by the cuff element");
    expect(text).toContain("| Cuff size | excluded (settled) | 1 | 0 | 1 | 0 |");
    expect(text).toContain("| Systolic pressure | included | 5 | 0 | 0 | 0 |");
  });

  it("names no person and no reason", async () => {
    await closedRoundWithSettling();
    const text = value(await exportDecisionReport(db, p.facilitator, p.projectId)).content;
    for (const name of ["Ann", "Bo", "Cas", "Dee", "Eli"]) {
      expect(text).not.toMatch(new RegExp(`\\b${name}\\b`));
    }
    expect(text).not.toContain("@example.test");
    expect(text).not.toContain("Unclear definition");
  });

  it("lists an unsettled To discuss element as to discuss", async () => {
    const roundId = await openedRound(db, p.facilitator, p.projectId);
    ok(await answer(p.raters.n1, roundId, p.elements[0], "discuss", "Unclear"));
    await closedNow(db, p.facilitator, p.projectId, roundId);
    const text = value(await exportDecisionReport(db, p.facilitator, p.projectId)).content;
    expect(text).toContain("| Systolic pressure | to discuss | 0 | 0 | 1 | 0 |");
    expect(text).not.toContain("Settled after the discussion:");
  });

  it("is for the facilitator only", async () => {
    await closedRoundWithSettling();
    expect(await exportDecisionReport(db, p.raters.n1, p.projectId)).toEqual({
      ok: false,
      error: "forbidden",
    });
    expect(await exportDecisionReport(db, p.outsider, p.projectId)).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
