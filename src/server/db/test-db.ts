// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Database tests on real PostgreSQL: each test gets a Kysely instance inside a transaction on
// this run's database, rolled back by `destroy()`. Kysely's own transactions become savepoints,
// so code under test commits and rolls back as usual and nothing outlives the test.
import {
  CompiledQuery,
  type DatabaseConnection,
  type Driver,
  Kysely,
  PostgresDialect,
  PostgresDriver,
  type PostgresPool,
  type PostgresPoolClient,
  type PostgresQueryResult,
} from "kysely";
import pg from "pg";
import { inject } from "vitest";
import type { DB } from "./schema.gen.ts";

declare module "vitest" {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

/** The dev stack database the run databases sit next to (compose.dev.yaml). */
export const DEFAULT_TEST_DATABASE_URL =
  "postgres://cdm_plenum:cdm_plenum@postgres:5432/cdm_plenum";

export function baseTestDatabaseUrl(): string {
  return process.env["TEST_DATABASE_URL"]?.trim() || DEFAULT_TEST_DATABASE_URL;
}

class SavepointDriver extends PostgresDriver {
  #depth = 0;

  override async beginTransaction(connection: DatabaseConnection): Promise<void> {
    this.#depth += 1;
    await connection.executeQuery(CompiledQuery.raw(`savepoint test_tx_${this.#depth}`));
  }

  override async commitTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(CompiledQuery.raw(`release savepoint test_tx_${this.#depth}`));
    this.#depth -= 1;
  }

  override async rollbackTransaction(connection: DatabaseConnection): Promise<void> {
    await connection.executeQuery(
      CompiledQuery.raw(`rollback to savepoint test_tx_${this.#depth}`),
    );
    await connection.executeQuery(CompiledQuery.raw(`release savepoint test_tx_${this.#depth}`));
    this.#depth -= 1;
  }
}

class SavepointDialect extends PostgresDialect {
  readonly #pool: PostgresPool;

  constructor(pool: PostgresPool) {
    super({ pool });
    this.#pool = pool;
  }

  override createDriver(): Driver {
    return new SavepointDriver({ pool: this.#pool });
  }
}

/** One connection for the whole test, its queries run one after the other. */
function pinnedClient(client: pg.Client): PostgresPoolClient & { idle(): Promise<void> } {
  let tail: Promise<unknown> = Promise.resolve();
  const query = (sql: unknown, parameters: ReadonlyArray<unknown> = []) => {
    if (typeof sql !== "string") throw new Error("A test database does not stream.");
    const result = tail.then(async () => {
      const { command, rowCount, rows } = await client.query(sql, [...parameters]);
      return { command, rowCount: rowCount ?? 0, rows } as PostgresQueryResult<unknown>;
    });
    tail = result.catch(() => undefined);
    return result;
  };
  return {
    query: query as PostgresPoolClient["query"],
    release: () => undefined,
    idle: () => tail.then(() => undefined),
  };
}

/** Returns a Kysely instance inside a transaction; call `destroy()` after every test. */
export async function createTestDb(url: string = inject("testDatabaseUrl")): Promise<Kysely<DB>> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("begin");
  const pinned = pinnedClient(client);
  let ended: Promise<void> | undefined;
  const end = () => {
    ended ??= (async () => {
      try {
        await pinned.idle();
        await client.query("rollback");
      } finally {
        await client.end();
      }
    })();
    return ended;
  };
  const pool: PostgresPool = { options: {}, connect: async () => pinned, end };
  return new TestKysely(pool, end);
}

class TestKysely extends Kysely<DB> {
  readonly #end: () => Promise<void>;

  constructor(pool: PostgresPool, end: () => Promise<void>) {
    super({ dialect: new SavepointDialect(pool) });
    this.#end = end;
  }

  override async destroy(): Promise<void> {
    await super.destroy();
    await this.#end();
  }
}
