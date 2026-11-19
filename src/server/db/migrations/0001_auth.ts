// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// better-auth core tables plus the organization plugin with teams (ADR 0004). Mirrors the plan of
// better-auth's migration planner; the drift test in src/server/db/migrations.test.ts fails when
// better-auth expects a different schema.
import { type Kysely, sql } from "kysely";

const now = sql`CURRENT_TIMESTAMP`;

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("user")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("email", "text", (col) => col.notNull().unique())
    .addColumn("emailVerified", "boolean", (col) => col.notNull())
    .addColumn("image", "text")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull().defaultTo(now))
    .execute();

  await db.schema
    .createTable("session")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("token", "text", (col) => col.notNull().unique())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .addColumn("ipAddress", "text")
    .addColumn("userAgent", "text")
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("activeOrganizationId", "text")
    .addColumn("activeTeamId", "text")
    .execute();

  await db.schema
    .createTable("account")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("accountId", "text", (col) => col.notNull())
    .addColumn("providerId", "text", (col) => col.notNull())
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("accessToken", "text")
    .addColumn("refreshToken", "text")
    .addColumn("idToken", "text")
    .addColumn("accessTokenExpiresAt", "timestamptz")
    .addColumn("refreshTokenExpiresAt", "timestamptz")
    .addColumn("scope", "text")
    .addColumn("password", "text")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("verification")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("identifier", "text", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addColumn("updatedAt", "timestamptz", (col) => col.notNull().defaultTo(now))
    .execute();

  await db.schema
    .createTable("organization")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("slug", "text", (col) => col.notNull().unique())
    .addColumn("logo", "text")
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("metadata", "text")
    .execute();

  await db.schema
    .createTable("team")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("memberCount", "integer", (col) => col.notNull())
    .addColumn("organizationId", "text", (col) =>
      col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .addColumn("updatedAt", "timestamptz")
    .execute();

  await db.schema
    .createTable("teamMember")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("teamId", "text", (col) => col.notNull().references("team.id").onDelete("cascade"))
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("membershipKey", "text", (col) => col.unique())
    .addColumn("createdAt", "timestamptz")
    .execute();

  await db.schema
    .createTable("member")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organizationId", "text", (col) =>
      col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("userId", "text", (col) => col.notNull().references("user.id").onDelete("cascade"))
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull())
    .execute();

  await db.schema
    .createTable("invitation")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("organizationId", "text", (col) =>
      col.notNull().references("organization.id").onDelete("cascade"),
    )
    .addColumn("email", "text", (col) => col.notNull())
    .addColumn("role", "text")
    .addColumn("teamId", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("expiresAt", "timestamptz", (col) => col.notNull())
    .addColumn("createdAt", "timestamptz", (col) => col.notNull().defaultTo(now))
    .addColumn("inviterId", "text", (col) =>
      col.notNull().references("user.id").onDelete("cascade"),
    )
    .execute();

  const indexes: [string, string, string][] = [
    ["session_userId_idx", "session", "userId"],
    ["account_userId_idx", "account", "userId"],
    ["verification_identifier_idx", "verification", "identifier"],
    ["team_organizationId_idx", "team", "organizationId"],
    ["teamMember_teamId_idx", "teamMember", "teamId"],
    ["teamMember_userId_idx", "teamMember", "userId"],
    ["member_organizationId_idx", "member", "organizationId"],
    ["member_userId_idx", "member", "userId"],
    ["invitation_organizationId_idx", "invitation", "organizationId"],
    ["invitation_email_idx", "invitation", "email"],
  ];
  for (const [name, table, column] of indexes) {
    await db.schema.createIndex(name).on(table).column(column).execute();
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const table of [
    "invitation",
    "member",
    "teamMember",
    "team",
    "organization",
    "verification",
    "account",
    "session",
    "user",
  ]) {
    await db.schema.dropTable(table).execute();
  }
}
