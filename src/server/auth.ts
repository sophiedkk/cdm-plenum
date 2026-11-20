// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// better-auth (ADR 0004): sign-in by single-use e-mail link, and projects as organizations with
// stakeholder groups as teams. The organization plugin owns the schema and the role vocabulary;
// every write goes through src/server/projects/ and src/server/invitations/, and the plugin's
// HTTP endpoints are unreachable.
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { magicLink, organization } from "better-auth/plugins";
import type { BetterAuthPlugin } from "better-auth/types";
import type { Kysely } from "kysely";
import { m } from "@/i18n/messages";
import type { ActivityAction } from "@/lib/activity-actions";
import { projectAccessControl, projectRoles } from "@/lib/project-roles";
import { SIGN_IN_LINK_MINUTES, SIGN_UP_REFUSED } from "@/lib/sign-in";
import { isDeactivated, isDeactivatedEmail } from "./admin/queries.ts";
import { getDb } from "./db/index.ts";
import type { DB } from "./db/schema.gen.ts";
import { type Env, getEnv } from "./env.ts";
import {
  acceptInvitationsOnSignIn,
  hasAccount,
  mayCreateAccount,
} from "./invitations/acceptance.ts";
import { INVITATION_LIFETIME_SECONDS } from "./invitations/lifetime.ts";
import { deliverSignInLink, getMailer, type Mailer } from "./mail.ts";

export interface AuthDeps {
  mailer: Mailer | null;
  /** In production a sign-in link is never logged. */
  production: boolean;
  log: (line: string) => void;
}

function notFound(): never {
  throw new APIError("NOT_FOUND");
}

/** The organization plugin for projects: custom roles, teams, every write refused. */
function projectOrganizations() {
  return organization({
    ac: projectAccessControl,
    roles: projectRoles,
    creatorRole: "facilitator",
    allowUserToCreateOrganization: false,
    invitationExpiresIn: INVITATION_LIFETIME_SECONDS,
    teams: { enabled: true, defaultTeam: { enabled: false }, allowRemovingAllTeams: true },
    schema: {
      team: {
        additionalFields: {
          expertType: { type: "string", required: true, input: false, fieldName: "expert_type" },
        },
      },
    },
    // A third lock behind `disabledPaths` and the guard below: the plugin's own writes refuse,
    // so a server-side `auth.api` call cannot write either.
    organizationHooks: {
      beforeCreateOrganization: async () => notFound(),
      beforeUpdateOrganization: async () => notFound(),
      beforeDeleteOrganization: async () => notFound(),
      beforeAddMember: async () => notFound(),
      beforeRemoveMember: async () => notFound(),
      beforeUpdateMemberRole: async () => notFound(),
      beforeCreateInvitation: async () => notFound(),
      beforeAcceptInvitation: async () => notFound(),
      beforeCancelInvitation: async () => notFound(),
      beforeRejectInvitation: async () => notFound(),
      beforeCreateTeam: async () => notFound(),
      beforeUpdateTeam: async () => notFound(),
      beforeDeleteTeam: async () => notFound(),
      beforeAddTeamMember: async () => notFound(),
      beforeRemoveTeamMember: async () => notFound(),
    },
  });
}

/** Every HTTP path of the organization plugin, all disabled. */
export const ORGANIZATION_PATHS: readonly string[] = Object.values(
  projectOrganizations().endpoints,
).flatMap((endpoint) => {
  const path: unknown = Reflect.get(endpoint, "path");
  return typeof path === "string" ? [path] : [];
});

/** A second lock behind `disabledPaths`, which matches the request path exactly. */
const organizationGuard = {
  id: "cdm-plenum-organization-guard",
  hooks: {
    before: [
      {
        matcher: (ctx) => typeof ctx.path === "string" && ctx.path.startsWith("/organization"),
        handler: createAuthMiddleware(async () => notFound()),
      },
    ],
  },
} satisfies BetterAuthPlugin;

// NOTE: #14. The magic link plugin allows 5 requests per 60 s per client address on both paths
// (https://www.better-auth.com/docs/concepts/rate-limit); a class behind one school address
// needs more. The link itself stays single use and expires after SIGN_IN_LINK_MINUTES.
export const SIGN_IN_RATE_LIMIT = { window: 60, max: 30 } as const;

/** The paths `SIGN_IN_RATE_LIMIT` applies to: asking for a sign-in link, and opening one. */
export const SIGN_IN_RATE_LIMITED_PATHS = ["/sign-in/magic-link", "/magic-link/verify"] as const;

export function createAuth(env: Env, db: Kysely<DB>, deps: AuthDeps) {
  return betterAuth({
    database: { db, type: "postgres" },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    disabledPaths: [...ORGANIZATION_PATHS],
    rateLimit: {
      // better-auth's own default: on in production only.
      enabled: deps.production,
      customRules: Object.fromEntries(
        SIGN_IN_RATE_LIMITED_PATHS.map((path) => [path, { ...SIGN_IN_RATE_LIMIT }]),
      ),
    },
    databaseHooks: {
      user: {
        create: {
          // PR1: an account exists only through an invitation or an administrator grant.
          before: async (user) => {
            if (!(await mayCreateAccount(db, user.email, new Date()))) {
              throw APIError.from("FORBIDDEN", {
                code: SIGN_UP_REFUSED,
                message: "No pending invitation or grant for this address",
              });
            }
          },
        },
      },
      session: {
        create: {
          // AD1: a deactivated account gets no session. `false` makes the link redirect to the
          // sign-in page with an error, as any link that does not work.
          before: async (session) => {
            if (await isDeactivated(db, session.userId)) return false;
          },
          after: async (session) => {
            // AD2: a sign-in, by account id only. A failed log entry does not refuse the sign-in.
            await db
              .insertInto("activity_log")
              .values({
                actor_user_id: session.userId,
                action: "signed_in" satisfies ActivityAction,
              })
              .execute()
              .catch(() => console.error(`sign_in_log_failed user=${session.userId}`));
            try {
              await acceptInvitationsOnSignIn(db, session.userId, new Date());
            } catch (error) {
              // NOTE: our own design. A failed acceptance must not refuse the sign-in: it rolled
              // back whole, the invitations stay pending and the next sign-in tries again.
              const kind = error instanceof Error ? error.name : "unknown";
              console.error(`invitation_accept_failed user=${session.userId} ${kind}`);
            }
          },
        },
      },
    },
    plugins: [
      magicLink({
        expiresIn: SIGN_IN_LINK_MINUTES * 60,
        storeToken: "hashed",
        sendMagicLink: async ({ email, url }) => {
          // An address that may not sign in gets no e-mail; the response is the same, so the
          // sign-in form does not tell which addresses have an account or an invitation.
          const now = new Date();
          if (!(await hasAccount(db, email)) && !(await mayCreateAccount(db, email, now))) return;
          if (await isDeactivatedEmail(db, email)) return;
          await deliverSignInLink(
            deps.mailer,
            {
              to: email,
              url,
              subject: m.mail_sign_in_subject(),
              text: m.mail_sign_in_body({ url, minutes: SIGN_IN_LINK_MINUTES }),
            },
            deps,
          );
        },
      }),
      projectOrganizations(),
      organizationGuard,
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

let auth: Auth | undefined;

/** The server's better-auth instance, created on first use. */
export function getAuth(): Auth {
  if (auth === undefined) {
    const env = getEnv();
    auth = createAuth(env, getDb(), {
      mailer: getMailer(),
      production: process.env["NODE_ENV"] === "production",
      log: (line) => console.warn(line),
    });
  }
  return auth;
}
