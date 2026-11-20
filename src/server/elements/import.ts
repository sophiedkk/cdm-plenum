// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The CSV import of candidate elements (EL3), facilitator only. The preview and the import parse
// the uploaded text on the server with the same reader; the import never trusts rows a client
// sends back.
import { type Kysely, sql } from "kysely";
import type { ActivityAction } from "@/lib/activity-actions";
import { type CsvParseResult, parseElementCsv } from "@/lib/element-csv";
import type { DB } from "../db/schema.gen.ts";
import { done, type ProjectResult, readProject, withProject } from "../projects/access.ts";
import { actorMemberId } from "../projects/member.ts";
import type { CsvImportInput } from "./schemas.ts";

/** What the file would add, without writing anything. */
export async function previewCsvImport(
  db: Kysely<DB>,
  userId: string,
  input: CsvImportInput,
): Promise<ProjectResult<CsvParseResult>> {
  return readProject(db, userId, input.projectId, { element: ["import"] }, async () =>
    done(parseElementCsv(input.content)),
  );
}

export type CsvImportResult =
  | Extract<CsvParseResult, { ok: false }>
  | {
      ok: true;
      /** The new elements, in file order. */
      elementIds: string[];
      refused: Extract<CsvParseResult, { ok: true }>["refused"];
      ignoredColumns: string[];
    };

/**
 * Adds one element per accepted row, each with a `csv` source labelled with the file name, in
 * one transaction. A file error writes nothing. The importing facilitator is the author.
 */
export async function importCsv(
  db: Kysely<DB>,
  userId: string,
  input: CsvImportInput,
): Promise<ProjectResult<CsvImportResult>> {
  return withProject<CsvImportResult>(
    db,
    userId,
    input.projectId,
    { element: ["import"] },
    async (trx, project) => {
      const parsed = parseElementCsv(input.content);
      if (!parsed.ok) return done(parsed);
      const { accepted, refused, ignoredColumns } = parsed;
      if (accepted.length === 0) return done({ ok: true, elementIds: [], refused, ignoredColumns });
      const authorMemberId = await actorMemberId(trx, project.id, userId);
      // uuidv7 is monotonic within a session, so the ids keep the file order on the board.
      const ids = await sql<{ id: string }>`
      select uuidv7()::text as id from generate_series(1, ${accepted.length})
    `.execute(trx);
      const elementIds = ids.rows.map((row) => row.id);
      const rows = accepted.map((row, index) => ({ row, id: elementIds[index] as string }));
      await trx
        .insertInto("element")
        .values(
          rows.map(({ row, id }) => ({
            id,
            project_id: project.id,
            name: row.name,
            description: row.description,
            data_type: row.dataType,
            min_occurs: row.cardinality?.min ?? null,
            max_occurs: row.cardinality?.max ?? null,
            author_member_id: authorMemberId,
          })),
        )
        .execute();
      await trx
        .insertInto("element_source")
        .values(elementIds.map((id) => ({ element_id: id, kind: "csv", label: input.fileName })))
        .execute();
      await trx
        .insertInto("activity_log")
        .values(
          elementIds.map((id) => ({
            actor_user_id: userId,
            project_id: project.id,
            action: "element_imported" satisfies ActivityAction,
            target_type: "element",
            target_id: id,
          })),
        )
        .execute();
      return done({ ok: true, elementIds, refused, ignoredColumns });
    },
  );
}
