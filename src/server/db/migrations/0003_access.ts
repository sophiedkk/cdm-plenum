// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Access (#2): the application-wide roles an administrator grants (AD1, ADR 0004), the expert
// type of a stakeholder group, and one membership per person per project and per group, so
// accepting an invitation twice at the same moment cannot add a second row.
import { type Kysely, sql } from "kysely";

// NOTE: owner decision 2026-11-19. `facilitator` is the right to create projects, held apart
// from the project role of the same name; `administrator` manages accounts (AD1).
export const APP_ROLE_KEYS = ["administrator", "facilitator"] as const;

/** The expert type of a stakeholder group (PR6); a test checks it against src/lib/project-roles.ts. */
export const EXPERT_TYPE_KEYS = ["clinical", "terminology", "architecture"] as const;

export async function up(db: Kysely<unknown>): Promise<void> {
  // Keyed by e-mail address, so a grant can exist before the account it lets in (PR1).
  await db.schema
    .createTable("app_role")
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("granted_at", "timestamptz", (col) => col.notNull().defaultTo(sql`now()`))
    .addPrimaryKeyConstraint("app_role_pk", ["email", "role"])
    .addCheckConstraint(
      "app_role_role_check",
      sql`role in (${sql.join(APP_ROLE_KEYS.map((key) => sql.lit(key)))})`,
    )
    // Stored as better-auth stores user.email: trimmed and in lower case.
    .addCheckConstraint(
      "app_role_email_check",
      sql`email = lower(btrim(email)) and length(email) > 0`,
    )
    .execute();

  // NOTE: PR6, owner decision 2026-11-19, after the Nictiz zib management agreements (NEN 7522).
  // Existing groups have no known type; `clinical` is the closest default for them.
  await db.schema
    .alterTable("team")
    .addColumn("expert_type", "text", (col) =>
      col
        .notNull()
        .defaultTo("clinical")
        .check(sql`expert_type in (${sql.join(EXPERT_TYPE_KEYS.map((key) => sql.lit(key)))})`),
    )
    .execute();
  await db.schema
    .alterTable("team")
    .alterColumn("expert_type", (col) => col.dropDefault())
    .execute();

  await db.schema
    .createIndex("member_organization_user_unique")
    .on("member")
    .columns(["organizationId", "userId"])
    .unique()
    .execute();
  await db.schema
    .createIndex("team_member_team_user_unique")
    .on("teamMember")
    .columns(["teamId", "userId"])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropIndex("team_member_team_user_unique").execute();
  await db.schema.dropIndex("member_organization_user_unique").execute();
  await db.schema.alterTable("team").dropColumn("expert_type").execute();
  await db.schema.dropTable("app_role").execute();
}
