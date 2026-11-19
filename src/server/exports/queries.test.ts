// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The exports (EX1, EX2, EX4, AD2) on real PostgreSQL: column content for a project with merged
// elements, a CKM link with an RM type outside the list, proposed values and two closed rounds,
// a negative test per role, and a check that the ratings export carries no person.
import type { Insertable, Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BOM } from "@/lib/csv";
import type { DB } from "../db/schema.gen.ts";
import { createTestDb } from "../db/test-db.ts";
import {
  facilitatorWithProject,
  groupId,
  insertUser,
  joinedParticipant,
} from "../test-fixtures.ts";
import { type ExportFile, exportElementsCsv, exportMindMap, exportRatingsCsv } from "./queries.ts";

let db: Kysely<DB>;

beforeEach(async () => {
  db = await createTestDb();
});

afterEach(async () => {
  await db.destroy();
});

/** Reads an RFC 4180 document as written by src/lib/csv.ts: BOM, CRLF, quoted text. */
function parseCsv(content: string): string[][] {
  expect(content.startsWith(BOM)).toBe(true);
  const text = content.slice(BOM.length);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\r" && text[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
    } else cell += char;
  }
  expect(row).toEqual([]);
  return rows;
}

/** The rows as objects keyed by the header. */
function records(file: ExportFile): Record<string, string>[] {
  const [header, ...rows] = parseCsv(file.content);
  if (!header) throw new Error("no header row");
  return rows.map((row) => Object.fromEntries(header.map((name, i) => [name, row[i] ?? ""])));
}

function value<T>(result: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!result.ok) throw new Error(`refused: ${result.error}`);
  return result.value;
}

async function addElement(
  projectId: string,
  values: Omit<Insertable<DB["element"]>, "project_id">,
): Promise<string> {
  const row = await db
    .insertInto("element")
    .values({ project_id: projectId, ...values })
    .returning("id")
    .executeTakeFirstOrThrow();
  return row.id;
}

/** The panel and minimum per expert type an opened round stores (DE12); 0 needs no reason. */
const OPENING_SNAPSHOT = {
  panel_clinical: 0,
  minimum_clinical: 0,
  panel_terminology: 0,
  minimum_terminology: 0,
  panel_architecture: 0,
  minimum_architecture: 0,
};

/** Opens a round with the given elements, so ratings can be stored; close it with `closeRound`. */
async function openRound(projectId: string, number: number, elementIds: string[]) {
  const round = await db
    .insertInto("round")
    .values({
      project_id: projectId,
      number,
      opened_at: new Date(Date.now() - 3_600_000),
      closes_at: new Date(Date.now() + 86_400_000),
      ...OPENING_SNAPSHOT,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("round_element")
    .values(elementIds.map((element_id) => ({ round_id: round.id, element_id })))
    .execute();
  return round.id;
}

async function closeRound(roundId: string, outcomes: Record<string, string>) {
  await db.updateTable("round").set({ closed_at: new Date() }).where("id", "=", roundId).execute();
  for (const [elementId, outcome] of Object.entries(outcomes)) {
    await db
      .updateTable("round_element")
      .set({ outcome })
      .where("round_id", "=", roundId)
      .where("element_id", "=", elementId)
      .execute();
  }
}

async function codeOf(projectId: string, userId: string): Promise<string> {
  const row = await db
    .selectFrom("rating_code")
    .innerJoin("member", "member.id", "rating_code.member_id")
    .select("rating_code.id")
    .where("rating_code.project_id", "=", projectId)
    .where("member.userId", "=", userId)
    .executeTakeFirstOrThrow();
  return row.id;
}

/**
 * A blood pressure project: four elements (one merged into another), a CKM link with the
 * deprecated `DV_PARAGRAPH`, proposed values, two closed rounds and a third not yet opened, and
 * eight raters: four in Nursing, three in General medicine and one in Patient.
 */
async function setup() {
  const { userId: facilitator, projectId } = await facilitatorWithProject(db);
  await db
    .updateTable("scope_statement")
    .set({ concept: "Bloeddruk & polsdruk" })
    .where("project_id", "=", projectId)
    .execute();

  const systolic = await addElement(projectId, {
    name: "Systolic",
    description: "Peak systemic arterial pressure.\nIn mmHg.",
    data_type: "quantity",
    min_occurs: 1,
    max_occurs: 1,
  });
  const duplicate = await addElement(projectId, {
    name: "Systolische druk",
    description: "Bovendruk",
    data_type: "quantity",
    merged_into: systolic,
  });
  const position = await addElement(projectId, {
    name: "Body position",
    description: "Houding tijdens de meting; Θέση σώματος",
    data_type: "coded_text",
    min_occurs: 0,
    max_occurs: 1,
  });
  const comment = await addElement(projectId, {
    name: '=HYPERLINK("http://example.test")',
    description: 'Free text about the measurement, "as typed".',
    min_occurs: 0,
    max_occurs: null,
  });
  await db
    .insertInto("element_source")
    .values([
      { element_id: systolic, kind: "brainstorm", label: "Session 1" },
      { element_id: systolic, kind: "ckm", label: "openEHR-EHR-OBSERVATION.blood_pressure.v2" },
      { element_id: duplicate, kind: "csv", label: "elementen.csv" },
      { element_id: duplicate, kind: "brainstorm", label: "Session 1" },
      { element_id: comment, kind: "ckm", label: "openEHR-EHR-OBSERVATION.blood_pressure.v2" },
    ])
    .execute();
  await db
    .insertInto("element_ckm_link")
    .values([
      {
        element_id: systolic,
        archetype_id: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
        cid: "1013.1.3574",
        revision: "2.1.5",
        at_code: "at0004",
        ckm_element_name: "Systolic",
        rm_type: "DV_QUANTITY",
      },
      {
        element_id: comment,
        archetype_id: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
        cid: "1013.1.3574",
        revision: "2.1.5",
        at_code: "at0033",
        ckm_element_name: "Comment",
        rm_type: "DV_PARAGRAPH",
      },
    ])
    .execute();
  await db
    .insertInto("element_value")
    .values([
      { element_id: position, position: 2, text: "Sitting", value: "2" },
      { element_id: position, position: 1, text: "Standing", value: "1" },
      { element_id: position, position: 3, text: "Liggend; plat", value: null },
    ])
    .execute();

  const raters: { userId: string; group: string; groupId: string }[] = [];
  const groups: [string, number][] = [
    ["Nursing", 4],
    ["General medicine", 3],
    ["Patient", 1],
  ];
  for (const [group, count] of groups) {
    for (let i = 0; i < count; i += 1) {
      const name = `${group.toLowerCase().replaceAll(" ", "")}${i}`;
      const userId = await joinedParticipant(db, facilitator, projectId, group, name);
      raters.push({ userId, group, groupId: await groupId(db, projectId, group) });
    }
  }
  // Invented names, so the privacy test can look for them.
  for (const [i, rater] of raters.entries()) {
    await db
      .updateTable("user")
      .set({ name: `Invented Rater ${i}` })
      .where("id", "=", rater.userId)
      .execute();
  }
  const codes = await Promise.all(raters.map((rater) => codeOf(projectId, rater.userId)));

  const round1 = await openRound(projectId, 1, [systolic, position, comment]);
  for (const [i, code] of codes.entries()) {
    const team_id = raters[i]?.groupId ?? null;
    await db
      .insertInto("rating")
      .values([
        {
          round_id: round1,
          element_id: systolic,
          rating_code_id: code,
          team_id,
          score: 7 + (i % 3),
        },
        {
          round_id: round1,
          element_id: position,
          rating_code_id: code,
          team_id,
          score: i === 0 ? null : 5,
          reason: i === 0 ? "=1+1; weet ik niet" : null,
        },
      ])
      .execute();
  }
  await closeRound(round1, {
    [systolic]: "included",
    [position]: "no_consensus",
    [comment]: "excluded",
  });

  const round2 = await openRound(projectId, 2, [position]);
  for (const [i, code] of codes.slice(0, 5).entries()) {
    await db
      .insertInto("rating")
      .values({
        round_id: round2,
        element_id: position,
        rating_code_id: code,
        team_id: raters[i]?.groupId ?? null,
        score: 8,
      })
      .execute();
  }
  await closeRound(round2, { [position]: "included" });

  await db
    .insertInto("round")
    .values({ project_id: projectId, number: 3, closes_at: new Date(Date.now() + 86_400_000) })
    .execute();

  const participant = raters[0]?.userId ?? "";
  const outsider = await insertUser(db, "out");
  return {
    facilitator,
    projectId,
    participant,
    outsider,
    raters,
    codes,
    elements: { systolic, duplicate, position, comment },
  };
}

describe("exportElementsCsv (EX1)", () => {
  it("writes one row per element that is not merged, with types, sources, CKM link and outcomes", async () => {
    const { facilitator, projectId } = await setup();
    const file = value(
      await exportElementsCsv(db, facilitator, projectId, new Date("2026-11-19T12:00:00Z")),
    );
    expect(file.filename).toBe("elements-2026-11-19.csv");
    expect(file.mediaType).toBe("text/csv; charset=utf-8");
    expect(file.content).toContain("\r\n");
    expect(parseCsv(file.content)[0]).toEqual([
      "name",
      "description",
      "openehr_type",
      "fhir_type",
      "cardinality",
      "sources",
      "ckm_archetype_id",
      "ckm_at_code",
      "ckm_revision",
      "proposed_values",
      "round_1_outcome",
      "round_2_outcome",
      "round_3_outcome",
    ]);
    // Sorted by code unit here: the export's own order follows the database collation.
    const rows = records(file).sort((a, b) => ((a["name"] ?? "") < (b["name"] ?? "") ? -1 : 1));
    expect(rows).toEqual([
      {
        name: '\'=HYPERLINK("http://example.test")',
        description: 'Free text about the measurement, "as typed".',
        openehr_type: "DV_PARAGRAPH",
        fhir_type: "",
        cardinality: "0..*",
        sources: "ckm: openEHR-EHR-OBSERVATION.blood_pressure.v2",
        ckm_archetype_id: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
        ckm_at_code: "at0033",
        ckm_revision: "2.1.5",
        proposed_values: "",
        round_1_outcome: "excluded",
        round_2_outcome: "",
        round_3_outcome: "",
      },
      {
        name: "Body position",
        description: "Houding tijdens de meting; Θέση σώματος",
        openehr_type: "DV_CODED_TEXT",
        fhir_type: "CodeableConcept",
        cardinality: "0..1",
        sources: "",
        ckm_archetype_id: "",
        ckm_at_code: "",
        ckm_revision: "",
        proposed_values: "Standing (1); Sitting (2); Liggend; plat",
        round_1_outcome: "no_consensus",
        round_2_outcome: "included",
        round_3_outcome: "",
      },
      {
        name: "Systolic",
        description: "Peak systemic arterial pressure.\nIn mmHg.",
        openehr_type: "DV_QUANTITY",
        fhir_type: "Quantity",
        cardinality: "1..1",
        sources:
          "brainstorm: Session 1; ckm: openEHR-EHR-OBSERVATION.blood_pressure.v2; csv: elementen.csv",
        ckm_archetype_id: "openEHR-EHR-OBSERVATION.blood_pressure.v2",
        ckm_at_code: "at0004",
        ckm_revision: "2.1.5",
        proposed_values: "",
        round_1_outcome: "included",
        round_2_outcome: "",
        round_3_outcome: "",
      },
    ]);
  });

  it("marks an element in a round without an outcome as pending", async () => {
    const { facilitator, projectId, elements } = await setup();
    const round3 = await db
      .selectFrom("round")
      .select("id")
      .where("project_id", "=", projectId)
      .where("number", "=", 3)
      .executeTakeFirstOrThrow();
    await db
      .insertInto("round_element")
      .values({ round_id: round3.id, element_id: elements.systolic })
      .execute();
    const rows = records(value(await exportElementsCsv(db, facilitator, projectId)));
    expect(rows.find((row) => row["name"] === "Systolic")?.["round_3_outcome"]).toBe("pending");
  });

  it("writes only the header for a project without elements or rounds", async () => {
    const { userId, projectId } = await facilitatorWithProject(db);
    const file = value(await exportElementsCsv(db, userId, projectId));
    expect(parseCsv(file.content)).toHaveLength(1);
    expect(parseCsv(file.content)[0]).toHaveLength(10);
  });

  it("carries no rating code", async () => {
    const { facilitator, projectId, codes } = await setup();
    const file = value(await exportElementsCsv(db, facilitator, projectId));
    for (const code of codes) expect(file.content).not.toContain(code);
  });
});

describe("exportMindMap (EX2)", () => {
  it("puts the concept at the root and the elements included by their latest closed round under it", async () => {
    const { facilitator, projectId, codes } = await setup();
    const file = value(
      await exportMindMap(db, facilitator, projectId, new Date("2026-11-19T12:00:00Z")),
    );
    expect(file.filename).toBe("elements-2026-11-19.mm");
    expect(file.mediaType).toBe("application/x-freemind");
    expect(file.content.startsWith('<map version="1.0.1">\n')).toBe(true);
    expect(file.content).toContain('<node ID="root" TEXT="Bloeddruk &amp; polsdruk">');
    const names = [...file.content.matchAll(/POSITION="right" TEXT="([^"]*)"/g)].map((m) => m[1]);
    expect(names).toEqual(["Body position", "Systolic"]);
    expect(file.content).toContain("<p>Peak systemic arterial pressure.</p><p>In mmHg.</p>");
    expect(file.content).toContain(
      "<p>Houding tijdens de meting; &#920;&#941;&#963;&#951; &#963;&#974;&#956;&#945;&#964;&#959;&#962;</p>",
    );
    for (const code of codes) expect(file.content).not.toContain(code);
  });

  it("maps every element that is not merged while no round has closed", async () => {
    const { userId, projectId } = await facilitatorWithProject(db);
    const kept = await addElement(projectId, { name: "Diastolic" });
    await addElement(projectId, { name: "Diastolisch", merged_into: kept });
    await addElement(projectId, { name: "Mean arterial pressure" });
    await openRound(projectId, 1, [kept]);
    const file = value(await exportMindMap(db, userId, projectId));
    const names = [...file.content.matchAll(/POSITION="right" TEXT="([^"]*)"/g)].map((m) => m[1]);
    expect(names).toEqual(["Diastolic", "Mean arterial pressure"]);
  });

  it("uses the project name as the root while the scope has no concept", async () => {
    const { userId, projectId } = await facilitatorWithProject(db);
    const file = value(await exportMindMap(db, userId, projectId));
    expect(file.content).toContain('<node ID="root" TEXT="Blood pressure">');
    expect(file.content).not.toContain("POSITION");
  });
});

describe("exportRatingsCsv (EX4)", () => {
  it("writes one row per rating of a closed round with the code, the group if large enough, round, element, score and reason", async () => {
    const { facilitator, projectId, raters, codes } = await setup();
    const file = value(
      await exportRatingsCsv(db, facilitator, projectId, new Date("2026-11-19T12:00:00Z")),
    );
    expect(file.filename).toBe("ratings-2026-11-19.csv");
    expect(parseCsv(file.content)[0]).toEqual([
      "participant_code",
      "stakeholder_group",
      "round",
      "element",
      "score",
      "reason",
    ]);
    const rows = records(file);
    expect(rows).toHaveLength(8 + 8 + 5);

    // Patient has 1 rater, so it is hidden; General medicine (3) is hidden as cover.
    const groupOf = new Map(raters.map((rater, i) => [codes[i], rater.group]));
    for (const row of rows) {
      const group = groupOf.get(row["participant_code"]);
      expect(group).toBeDefined();
      expect(row["stakeholder_group"]).toBe(group === "Nursing" ? "Nursing" : "");
    }

    const round1Position = rows.filter(
      (row) => row["round"] === "1" && row["element"] === "Body position",
    );
    expect(round1Position).toHaveLength(8);
    const unable = round1Position.find((row) => row["participant_code"] === codes[0]);
    expect(unable).toMatchObject({ score: "", reason: "'=1+1; weet ik niet" });
    expect(rows.filter((row) => row["round"] === "2").every((row) => row["score"] === "8")).toBe(
      true,
    );
    expect(
      rows.filter((row) => row["round"] === "1" && row["element"] === "Systolic"),
    ).toHaveLength(8);
    expect(rows.map((row) => row["round"])).toEqual([...rows.map((row) => row["round"])].sort());
  });

  it("leaves out the ratings of a round that is still open", async () => {
    const { facilitator, projectId, elements, codes } = await setup();
    const round4 = await openRound(projectId, 4, [elements.systolic]);
    await db
      .insertInto("rating")
      .values({
        round_id: round4,
        element_id: elements.systolic,
        rating_code_id: codes[0] ?? "",
        score: 9,
      })
      .execute();
    const rows = records(value(await exportRatingsCsv(db, facilitator, projectId)));
    expect(rows.some((row) => row["round"] === "4")).toBe(false);
  });

  it("holds no member id, user id, name or e-mail address", async () => {
    const { facilitator, projectId, raters } = await setup();
    const file = value(await exportRatingsCsv(db, facilitator, projectId));
    const people = await db
      .selectFrom("member")
      .innerJoin("user", "user.id", "member.userId")
      .select(["member.id as memberId", "user.id as userId", "user.name", "user.email"])
      .where("member.organizationId", "=", projectId)
      .execute();
    expect(people).toHaveLength(raters.length + 1);
    for (const person of people) {
      expect(file.content).not.toContain(person.memberId);
      expect(file.content).not.toContain(person.userId);
      expect(file.content).not.toContain(person.email);
      if (person.name !== "") expect(file.content).not.toContain(person.name);
    }
    expect(file.content).not.toContain("example.test");
  });

  it("writes only the header while no round has closed", async () => {
    const { userId, projectId } = await facilitatorWithProject(db);
    const file = value(await exportRatingsCsv(db, userId, projectId));
    expect(parseCsv(file.content)).toHaveLength(1);
  });
});

const EXPORTS = [
  ["exportElementsCsv", exportElementsCsv, "export_elements_csv"],
  ["exportMindMap", exportMindMap, "export_mind_map"],
  ["exportRatingsCsv", exportRatingsCsv, "export_ratings_csv"],
] as const;

describe.each(EXPORTS)("%s access and log (Q-SEC-1, AD2)", (_name, run, action) => {
  it("logs the export with ids only", async () => {
    const { facilitator, projectId } = await setup();
    value(await run(db, facilitator, projectId));
    const rows = await db
      .selectFrom("activity_log")
      .selectAll()
      .where("project_id", "=", projectId)
      .where("action", "=", action)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actor_user_id: facilitator,
      target_type: "project",
      target_id: projectId,
    });
  });

  it("refuses a participant with forbidden and logs nothing", async () => {
    const { participant, projectId } = await setup();
    expect(await run(db, participant, projectId)).toEqual({ ok: false, error: "forbidden" });
    const logged = await db
      .selectFrom("activity_log")
      .select("id")
      .where("action", "=", action)
      .execute();
    expect(logged).toEqual([]);
  });

  it("answers not_found to a user outside the project and for an unknown project", async () => {
    const { outsider, facilitator, projectId } = await setup();
    expect(await run(db, outsider, projectId)).toEqual({ ok: false, error: "not_found" });
    expect(await run(db, facilitator, "00000000-0000-4000-8000-000000000000")).toEqual({
      ok: false,
      error: "not_found",
    });
  });
});
