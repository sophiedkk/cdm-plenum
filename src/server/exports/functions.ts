// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Export server functions: session middleware, then Zod validation, then the query, which checks
// the project role itself. POST, because every export writes an activity log row (AD2).
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/index.ts";
import { requireSession } from "../middleware.ts";
import { csvExportInput, projectInput } from "../projects/schemas.ts";
import { exportDecisionReport } from "./decision-report.ts";
import { exportElementsCsv, exportMindMap, exportRatingsCsv } from "./queries.ts";

export const exportElementsCsvFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(csvExportInput)
  .handler(({ data, context }) =>
    exportElementsCsv(getDb(), context.userId, data.projectId, data.separator),
  );

export const exportMindMapFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => exportMindMap(getDb(), context.userId, data.projectId));

export const exportRatingsCsvFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(csvExportInput)
  .handler(({ data, context }) =>
    exportRatingsCsv(getDb(), context.userId, data.projectId, data.separator),
  );

export const exportDecisionReportFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) => exportDecisionReport(getDb(), context.userId, data.projectId));
