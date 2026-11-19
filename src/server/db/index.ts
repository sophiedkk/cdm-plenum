// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The connection pool and the typed query builder, created once per server process.
import { Kysely, PostgresDialect } from "kysely";
import { Migrator } from "kysely/migration";
import pg from "pg";
import { getEnv } from "../env.ts";
import { migrationProvider } from "./migrations/index.ts";
import type { DB } from "./schema.gen.ts";

export type Database = Kysely<DB>;

let pool: pg.Pool | undefined;
let db: Database | undefined;

/** The shared connection pool, also handed to better-auth. Created on first use. */
export function getPool(): pg.Pool {
  if (pool === undefined) {
    pool = new pg.Pool({ connectionString: getEnv().DATABASE_URL, max: 10 });
    // NOTE: node-postgres docs, "Pool: error". An idle client the server drops emits here;
    // unhandled, it crashes the process. The pool replaces the client.
    pool.on("error", (error) => {
      console.error("Idle database connection lost:", error.message);
    });
  }
  return pool;
}

/** The typed query builder over the shared pool. */
export function getDb(): Database {
  db ??= new Kysely<DB>({ dialect: new PostgresDialect({ pool: getPool() }) });
  return db;
}

export function createMigrator<T>(database: Kysely<T>): Migrator {
  return new Migrator({ db: database, provider: migrationProvider });
}
