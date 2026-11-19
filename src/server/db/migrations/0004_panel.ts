// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The minimum panel (DE11 to DE13, ADR 0010): the change class of a project, its own minimum per
// expert type, and on each round the panel and the minimum as they were when it opened. A rating
// also keeps the stakeholder group of its rater, so group results (DE5) never read the
// code-to-member table (ADR 0005).
import { type Kysely, sql } from "kysely";

/** The change classes A to D; a test checks them against src/lib/panel.ts. */
export const CHANGE_CLASS_KEYS = ["A", "B", "C", "D"] as const;

const EXPERT_TYPE_KEYS = ["clinical", "terminology", "architecture"] as const;
const inList = (values: readonly string[]) => sql.join(values.map((value) => sql.lit(value)));

// NOTE: our own design, no spec governs it. One column per expert type, not a jsonb object: the
// list is fixed by team_expert_type_check, and plain columns let CHECK constraints hold the rule.
const PANEL_COLUMNS = EXPERT_TYPE_KEYS.flatMap((type) => [`panel_${type}`, `minimum_${type}`]);

const lockedColumns = (prefix: "new" | "old", extra: readonly string[]) =>
  [
    "scale_min",
    "scale_max",
    "bottom_band_max",
    "top_band_min",
    "agreement_pct",
    "opposition_pct",
    "facilitator_sees_raters",
    "closes_at",
    "opened_at",
    "project_id",
    "number",
    ...extra,
  ]
    .map((column) => `${prefix}.${column}`)
    .join(", ");

/** The DE2 lock of 0002, extended with the opening snapshots of DE12 when `extra` names them. */
function lockFunction(extra: readonly string[]): string {
  return `
    create or replace function round_rule_locked() returns trigger language plpgsql as $$
    begin
      if old.opened_at is not null and (
        ${lockedColumns("new", extra)}
      ) is distinct from (
        ${lockedColumns("old", extra)}
      ) then
        raise exception 'round_rule_locked' using errcode = 'check_violation';
      end if;
      return new;
    end
    $$
  `;
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // NOTE: DE11, owner decision 2026-11-19: a project starts as class D, a new model.
  await db.schema
    .alterTable("project")
    .addColumn("change_class", "text", (col) =>
      col
        .notNull()
        .defaultTo("D")
        .check(sql`change_class in (${inList(CHANGE_CLASS_KEYS)})`),
    )
    .execute();

  // DE13: a row exists only where the facilitator replaced the class default.
  await db.schema
    .createTable("project_panel_minimum")
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("project.id").onDelete("cascade"),
    )
    .addColumn("expert_type", "text", (col) => col.notNull())
    .addColumn("minimum", "smallint", (col) => col.notNull())
    .addPrimaryKeyConstraint("project_panel_minimum_pk", ["project_id", "expert_type"])
    .addCheckConstraint(
      "project_panel_minimum_expert_type_check",
      sql`expert_type in (${inList(EXPERT_TYPE_KEYS)})`,
    )
    .addCheckConstraint("project_panel_minimum_minimum_check", sql`minimum >= 0`)
    .execute();

  const addPanel = PANEL_COLUMNS.map(
    (column) => `add column ${column} smallint check (${column} >= 0)`,
  );
  await sql
    .raw(`alter table round ${[...addPanel, "add column below_minimum_reason text"].join(", ")}`)
    .execute(db);

  const panel = PANEL_COLUMNS.map((column) => `${column} is not null`).join(" and ");
  const empty = [...PANEL_COLUMNS, "below_minimum_reason"]
    .map((column) => `${column} is null`)
    .join(" and ");
  const below = EXPERT_TYPE_KEYS.map((type) => `panel_${type} < minimum_${type}`).join(" or ");
  // NOTE: DE12. A draft has no snapshot; an open round has all of it, and a reason exactly when
  // the panel was below the minimum, so no code path can open below it without one.
  await sql
    .raw(`
      alter table round add constraint round_panel_snapshot_check check (
        (opened_at is null and ${empty})
        or (
          opened_at is not null and ${panel}
          and (below_minimum_reason is not null) = (${below})
          and (below_minimum_reason is null or length(btrim(below_minimum_reason)) > 0)
        )
      )
    `)
    .execute(db);

  // NOTE: DE2, DE12. The opening snapshot is part of what the round decided on; it stays fixed.
  await sql.raw(lockFunction([...PANEL_COLUMNS, "below_minimum_reason"])).execute(db);

  // The rater's stakeholder group when they last saved the rating (DE5, Q-PRIV-3).
  await db.schema
    .alterTable("rating")
    .addColumn("team_id", "text", (col) => col.references("team.id").onDelete("set null"))
    .execute();
  await db.schema
    .createIndex("rating_round_id_team_id_idx")
    .on("rating")
    .columns(["round_id", "team_id"])
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("rating_round_id_team_id_idx").execute();
  await db.schema.alterTable("rating").dropColumn("team_id").execute();
  await sql.raw(lockFunction([])).execute(db);
  await sql`alter table round drop constraint round_panel_snapshot_check`.execute(db);
  const dropped = [...PANEL_COLUMNS, "below_minimum_reason"].map(
    (column) => `drop column ${column}`,
  );
  await sql.raw(`alter table round ${dropped.join(", ")}`).execute(db);
  await db.schema.dropTable("project_panel_minimum").execute();
  await db.schema.alterTable("project").dropColumn("change_class").execute();
}
