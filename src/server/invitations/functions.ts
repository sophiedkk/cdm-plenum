// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Invitation server functions: session middleware, then Zod validation, then the query, which
// checks the project role itself. The preview is the one function without a session: the
// invitation page shows it before sign-in.
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "../db/index.ts";
import { getEnv } from "../env.ts";
import { getMailer } from "../mail.ts";
import { requireSession } from "../middleware.ts";
import { projectInput } from "../projects/schemas.ts";
import {
  invitationPreview,
  invite,
  listInvitations,
  restoreInvitation,
  revokeInvitation,
} from "./queries.ts";
import { invitationIdInput, invitationInput, inviteInput } from "./schemas.ts";

export const inviteFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(inviteInput)
  .handler(({ data, context }) => {
    const env = getEnv();
    return invite(getDb(), context.userId, data, {
      baseUrl: env.BETTER_AUTH_URL,
      mailer: getMailer(),
      now: new Date(),
    });
  });

export const listInvitationsFn = createServerFn({ method: "GET" })
  .middleware([requireSession])
  .validator(projectInput)
  .handler(({ data, context }) =>
    listInvitations(getDb(), context.userId, data.projectId, {
      baseUrl: getEnv().BETTER_AUTH_URL,
      now: new Date(),
    }),
  );

export const revokeInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(invitationInput)
  .handler(({ data, context }) => revokeInvitation(getDb(), context.userId, data));

export const restoreInvitationFn = createServerFn({ method: "POST" })
  .middleware([requireSession])
  .validator(invitationInput)
  .handler(({ data, context }) =>
    restoreInvitation(getDb(), context.userId, data, { now: new Date() }),
  );

export const invitationPreviewFn = createServerFn({ method: "GET" })
  .validator(invitationIdInput)
  .handler(({ data }) => invitationPreview(getDb(), data.invitationId, new Date()));
