// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The allowed units of a quantity (DT1, issue #71): a structure proposal and the element it
// settles onto carry a list of UCUM codes, the first the preferred one. Only a quantity and a
// quantity interval take units.
import { type Kysely, sql } from "kysely";

const TABLES = ["detail_proposal", "element"] as const;

// NOTE: no spec governs the check, our own design after UCUM (https://ucum.org/ucum): printable
// ASCII, no spaces. Joined with chr(1), so a space inside a unit fails; src/lib/units.ts agrees.
const unitsCheck = sql`cardinality(units) = 0 or (
  coalesce(data_type in ('quantity', 'quantity_interval'), false)
  and cardinality(units) <= 10
  and array_position(units, null) is null
  and array_to_string(units, chr(1)) ~ ('^[!-~]{1,40}(' || chr(1) || '[!-~]{1,40})*$')
)`;

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await db.schema
      .alterTable(table)
      .addColumn("units", sql`text[]`, (col) => col.notNull().defaultTo(sql`'{}'`))
      .execute();
    await db.schema
      .alterTable(table)
      .addCheckConstraint(`${table}_units_check`, unitsCheck)
      .execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of TABLES) {
    await db.schema.alterTable(table).dropConstraint(`${table}_units_check`).execute();
    await db.schema.alterTable(table).dropColumn("units").execute();
  }
}
