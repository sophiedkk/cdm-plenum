// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Migration 0012 on its own run database: the CKM links of 0002 are copied into source models,
// source elements and element links on the way up, and the new tables go on the way down while
// element_ckm_link keeps its rows.
import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";
import { afterEach, describe, expect, it } from "vitest";
import { createMigrator } from "./index.ts";
import { baseTestDatabaseUrl } from "./test-db.ts";
import { createRunDatabase, dropRunDatabase } from "./test-run-database.ts";

const BP = "openEHR-EHR-OBSERVATION.blood_pressure.v2";
const PULSE = "openEHR-EHR-OBSERVATION.pulse.v2";

let cleanup: (() => Promise<void>) | undefined;

afterEach(async () => {
  await cleanup?.();
  cleanup = undefined;
});

async function runDatabase(): Promise<Kysely<unknown>> {
  const baseUrl = baseTestDatabaseUrl();
  const runUrl = await createRunDatabase(baseUrl);
  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: runUrl, max: 1 }) }),
  });
  cleanup = async () => {
    await db.destroy();
    await dropRunDatabase(baseUrl, runUrl);
  };
  return db;
}

/** A project with three elements: two linked to blood pressure (one imported), one to pulse. */
async function seed(db: Kysely<unknown>): Promise<{ projectId: string; elements: string[] }> {
  await sql`insert into "user" (id, name, email, "emailVerified", "createdAt", "updatedAt")
    values ('user-fac', '', 'fac@example.test', true, now(), now())`.execute(db);
  await sql`insert into organization (id, name, slug, "createdAt")
    values ('project-1', 'Blood pressure', 'project-1', now())`.execute(db);
  await sql`insert into project (id) values ('project-1')`.execute(db);
  const elements: string[] = [];
  for (const name of ["Systolic", "Diastolic", "Rate"]) {
    const row = await sql<{ id: string }>`insert into element (project_id, name)
      values ('project-1', ${name}) returning id`.execute(db);
    elements.push(row.rows[0]?.id ?? "");
  }
  const [systolic, diastolic, rate] = elements;
  await sql`insert into element_source (element_id, kind, label)
    values (${systolic}, 'ckm', ${BP}), (${diastolic}, 'ckm', ${BP})`.execute(db);
  await sql`insert into element_ckm_link
    (element_id, archetype_id, cid, revision, at_code, ckm_element_name, rm_type, linked_at) values
    (${systolic}, ${BP}, '1013.1.3574', '2.0.16', 'at0004', 'Systolic', 'DV_QUANTITY', '2026-11-01'),
    (${diastolic}, ${BP}, '1013.1.3574', '2.0.17', 'at0005', 'Diastolic', 'DV_QUANTITY', '2026-11-02'),
    (${rate}, ${PULSE}, '1013.1.4295', '2.0.3', 'at0004', 'Rate', 'DV_QUANTITY', '2026-11-03')
  `.execute(db);
  return { projectId: "project-1", elements };
}

describe("migration 0012_source_models", () => {
  it("copies each CKM link into the source model tables, and drops them again", async () => {
    const db = await runDatabase();
    const migrator = createMigrator(db);
    const before = await migrator.migrateTo("0011_element_marks");
    expect(before.error).toBeUndefined();
    const { elements } = await seed(db);
    const [systolic, diastolic, rate] = elements;

    const up = await migrator.migrateTo("0012_source_models");
    expect(up.error).toBeUndefined();
    const models = await sql<Record<string, unknown>>`
      select kind, status, title, ckm_archetype_id, ckm_cid, ckm_revision,
        imported_at is not null as imported
      from source_model order by ckm_archetype_id`.execute(db);
    expect(models.rows).toEqual([
      {
        kind: "ckm",
        status: "imported",
        title: BP,
        ckm_archetype_id: BP,
        ckm_cid: "1013.1.3574",
        ckm_revision: "2.0.17",
        imported: true,
      },
      {
        kind: "ckm",
        status: "added",
        title: PULSE,
        ckm_archetype_id: PULSE,
        ckm_cid: "1013.1.4295",
        ckm_revision: "2.0.3",
        imported: false,
      },
    ]);
    const links = await sql<Record<string, unknown>>`
      select link.element_id, source.at_code, source.path, source.name, source.type,
        model.ckm_archetype_id
      from element_source_link link
      join source_element source on source.id = link.source_element_id
      join source_model model on model.id = source.source_model_id
      order by model.ckm_archetype_id, source.position`.execute(db);
    expect(links.rows).toEqual([
      {
        element_id: systolic,
        at_code: "at0004",
        path: "at0004",
        name: "Systolic",
        type: "DV_QUANTITY",
        ckm_archetype_id: BP,
      },
      {
        element_id: diastolic,
        at_code: "at0005",
        path: "at0005",
        name: "Diastolic",
        type: "DV_QUANTITY",
        ckm_archetype_id: BP,
      },
      {
        element_id: rate,
        at_code: "at0004",
        path: "at0004",
        name: "Rate",
        type: "DV_QUANTITY",
        ckm_archetype_id: PULSE,
      },
    ]);
    // A fhir source on an element is allowed from 0012 on.
    await sql`insert into element_source (element_id, kind, label)
      values (${rate}, 'fhir', 'Example BloodPressure')`.execute(db);

    const down = await migrator.migrateTo("0011_element_marks");
    expect(down.error).toBeUndefined();
    const tables = (await db.introspection.getTables()).map((table) => table.name);
    expect(tables).not.toContain("source_model");
    expect(tables).not.toContain("source_element");
    expect(tables).not.toContain("element_source_link");
    const kept = await sql<{ n: string }>`select count(*) as n from element_ckm_link`.execute(db);
    expect(Number(kept.rows[0]?.n)).toBe(3);
    const sources = await sql<{ kind: string }>`
      select distinct kind from element_source order by kind`.execute(db);
    expect(sources.rows).toEqual([{ kind: "ckm" }]);
    await expect(
      sql`insert into element_source (element_id, kind, label)
        values (${rate}, 'zib', 'x')`.execute(db),
    ).rejects.toThrow(/element_source_kind_check/);
  });

  it("enforces the source model rules in the database", async () => {
    const db = await runDatabase();
    const migrator = createMigrator(db);
    expect((await migrator.migrateToLatest()).error).toBeUndefined();
    await sql`insert into organization (id, name, slug, "createdAt")
      values ('project-2', 'Pulse', 'project-2', now())`.execute(db);
    await sql`insert into project (id) values ('project-2')`.execute(db);
    const insert = (columns: string, values: string) =>
      sql
        .raw(`insert into source_model (project_id, ${columns}) values ('project-2', ${values})`)
        .execute(db);
    await expect(insert("kind, status, title", "'fhir', 'suggested', 'x'")).rejects.toThrow(
      /source_model_fhir_check|source_model_suggested_check/,
    );
    await expect(insert("kind, status, title", "'ckm', 'added', 'x'")).rejects.toThrow(
      /source_model_ckm_check/,
    );
    await expect(insert("kind, status, title", "'other', 'imported', 'x'")).rejects.toThrow(
      /source_model_imported_check/,
    );
    await expect(
      insert("kind, status, title, link", "'other', 'added', 'x', 'ftp://a'"),
    ).rejects.toThrow(/source_model_link_check/);
    await expect(insert("kind, status, title", "'other', 'added', '  '")).rejects.toThrow(
      /source_model_title_check/,
    );
    const zib = `'zib', 'added', 'x', 'p', '1', 'http://x'`;
    await expect(
      insert("kind, status, title, fhir_package, fhir_version, fhir_canonical", zib),
    ).rejects.toThrow(/source_model_zib_check/);
    const fhir = `'fhir', 'added', 'x', 'p', '1', 'http://x'`;
    await insert("kind, status, title, fhir_package, fhir_version, fhir_canonical", fhir);
    await expect(
      insert("kind, status, title, fhir_package, fhir_version, fhir_canonical", fhir),
    ).rejects.toThrow(/source_model_fhir_unique/);
  });
});
