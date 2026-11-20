// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's grouping of the elements (EL18) and the participants' check of it (EL24),
// ADR 0020. Each project starts with one group per brainstorm question; an element starts in the
// group of its question, or in none ("Not grouped yet"). The participants' remarks carry the
// member id, as marks do (EL16): no participant query selects it (EL2, ADR 0005).
import { type Kysely, sql } from "kysely";
import { ELEMENT_PROMPT_KEYS } from "./0007_private_brainstorm.ts";

/** The longest group name and "something missing" remark; src/lib/element-groups.ts agrees. */
export const ELEMENT_GROUP_NAME_MAX = 80;
export const GROUP_MISSING_MAX = 500;

const inList = (keys: readonly string[]) => sql.join(keys.map((key) => sql.lit(key)));

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("element_group")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("project_id", "text", (col) =>
      col.notNull().references("project.id").onDelete("cascade"),
    )
    // The question a starting group stands for; null for a group the facilitator added.
    .addColumn("prompt", "text")
    // Null keeps the translated name of the question's group until the facilitator renames it.
    .addColumn("name", "text")
    .addColumn("position", "integer", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "element_group_prompt_check",
      sql`prompt is null or prompt in (${inList(ELEMENT_PROMPT_KEYS)})`,
    )
    .addCheckConstraint(
      "element_group_name_check",
      sql`(name is null and prompt is not null) or (length(btrim(name)) > 0 and length(name) <= ${sql.lit(ELEMENT_GROUP_NAME_MAX)})`,
    )
    .execute();
  await sql`
    create unique index element_group_prompt_unique on element_group (project_id, prompt)
    where prompt is not null
  `.execute(db);
  await db.schema
    .createIndex("element_group_project_id_idx")
    .on("element_group")
    .column("project_id")
    .execute();

  await db.schema
    .alterTable("element")
    .addColumn("group_id", "uuid", (col) => col.references("element_group.id").onDelete("set null"))
    .execute();
  await db.schema.createIndex("element_group_id_idx").on("element").column("group_id").execute();

  // NOTE: EL18, ADR 0020. The database places every new element by its question and gives
  // every new project its starting groups, so no insert path can forget either.
  await sql`
    create function element_group_start() returns trigger language plpgsql as $$
    begin
      if new.group_id is null and new.prompt is not null then
        select id into new.group_id from element_group
        where project_id = new.project_id and prompt = new.prompt;
      end if;
      return new;
    end $$
  `.execute(db);
  await sql`
    create trigger element_group_start before insert on element
    for each row execute function element_group_start()
  `.execute(db);
  await sql`
    create function project_groups_start() returns trigger language plpgsql as $$
    begin
      insert into element_group (project_id, prompt, position)
      select new.id, start.prompt, start.ordinality - 1
      from unnest(array[${inList(ELEMENT_PROMPT_KEYS)}]::text[]) with ordinality as start(prompt, ordinality);
      return new;
    end $$
  `.execute(db);
  await sql`
    create trigger project_groups_start after insert on project
    for each row execute function project_groups_start()
  `.execute(db);
  await sql`
    insert into element_group (project_id, prompt, position)
    select project.id, start.prompt, start.ordinality - 1
    from project, unnest(array[${inList(ELEMENT_PROMPT_KEYS)}]::text[]) with ordinality as start(prompt, ordinality)
  `.execute(db);
  await sql`
    update element set group_id = element_group.id
    from element_group
    where element_group.project_id = element.project_id and element_group.prompt = element.prompt
  `.execute(db);

  await db.schema.alterTable("project").addColumn("group_check_at", "timestamptz").execute();

  await db.schema
    .createTable("element_elsewhere")
    .addColumn("element_id", "uuid", (col) =>
      col.notNull().references("element.id").onDelete("cascade"),
    )
    // Never selected in a participant query (EL24, EL2).
    .addColumn("member_id", "text", (col) =>
      col.notNull().references("member.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("element_elsewhere_pkey", ["element_id", "member_id"])
    .execute();
  await db.schema
    .createIndex("element_elsewhere_member_id_idx")
    .on("element_elsewhere")
    .column("member_id")
    .execute();

  await db.schema
    .createTable("group_missing")
    .addColumn("id", "uuid", (col) => col.primaryKey().defaultTo(sql`uuidv7()`))
    .addColumn("group_id", "uuid", (col) =>
      col.notNull().references("element_group.id").onDelete("cascade"),
    )
    // Never selected in a participant query (EL24, EL2).
    .addColumn("member_id", "text", (col) =>
      col.notNull().references("member.id").onDelete("cascade"),
    )
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("created_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addCheckConstraint(
      "group_missing_body_check",
      sql`length(btrim(body)) > 0 and length(body) <= ${sql.lit(GROUP_MISSING_MAX)}`,
    )
    .execute();
  await db.schema
    .createIndex("group_missing_group_id_idx")
    .on("group_missing")
    .column("group_id")
    .execute();

  await db.schema
    .createTable("group_check_done")
    .addColumn("member_id", "text", (col) =>
      col.primaryKey().references("member.id").onDelete("cascade"),
    )
    .addColumn("done_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("group_check_done").execute();
  await db.schema.dropTable("group_missing").execute();
  await db.schema.dropTable("element_elsewhere").execute();
  await db.schema.alterTable("project").dropColumn("group_check_at").execute();
  await sql`drop trigger project_groups_start on project`.execute(db);
  await sql`drop function project_groups_start()`.execute(db);
  await sql`drop trigger element_group_start on element`.execute(db);
  await sql`drop function element_group_start()`.execute(db);
  await db.schema.alterTable("element").dropColumn("group_id").execute();
  await db.schema.dropTable("element_group").execute();
}
