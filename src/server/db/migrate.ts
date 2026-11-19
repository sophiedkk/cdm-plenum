// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// `pnpm db:migrate` runs the migrations to the latest; `pnpm db:migrate down` reverts one.
// Runs on plain Node (type stripping) with DATABASE_URL only.
import { Kysely, PostgresDialect } from "kysely";
import type { MigrationResultSet } from "kysely/migration";
import pg from "pg";
import { createMigrator } from "./index.ts";

type Direction = "up" | "down";

/** Prints each step and returns the exit code. */
export function report(
  { error, results }: MigrationResultSet,
  out: (line: string) => void,
): number {
  for (const result of results ?? []) {
    out(`${result.direction} ${result.migrationName}: ${result.status}`);
  }
  if (results?.length === 0) out("No migrations to run.");
  if (error) {
    out(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
  return 0;
}

export function parseDirection(args: readonly string[]): Direction | null {
  if (args.length === 0) return "up";
  if (args.length === 1 && (args[0] === "up" || args[0] === "down")) return args[0];
  return null;
}

async function main(): Promise<number> {
  const direction = parseDirection(process.argv.slice(2));
  if (direction === null) {
    console.error("usage: migrate [up|down]");
    return 2;
  }
  const url = process.env["DATABASE_URL"];
  if (!url) {
    console.error("Invalid environment configuration: DATABASE_URL");
    return 1;
  }
  const db = new Kysely<unknown>({
    dialect: new PostgresDialect({ pool: new pg.Pool({ connectionString: url, max: 1 }) }),
  });
  try {
    const migrator = createMigrator(db);
    const result =
      direction === "up" ? await migrator.migrateToLatest() : await migrator.migrateDown();
    // biome-ignore lint/suspicious/noConsole: the CLI's own output
    return report(result, (line) => console.log(line));
  } finally {
    await db.destroy();
  }
}

if (import.meta.main) {
  process.exitCode = await main();
}
