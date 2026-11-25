// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Server function middleware: the session check of Q-SEC-1. Route guards only steer navigation;
// every server function that reads or writes user data uses this. The project role is checked
// inside each query (src/server/projects/access.ts).
import { createMiddleware } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getAuth } from "./auth.ts";
import { getDb } from "./db/index.ts";
import { readSession } from "./session/read.ts";

export class AuthError extends Error {
  readonly status = 401;
  constructor() {
    super("Not signed in");
  }
}

/** Requires a session; hands the user id, never more, to the handler. */
export const requireSession = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const session = await readSession(getAuth(), getDb(), getRequestHeaders());
  if (!session) throw new AuthError();
  return next({ context: { userId: session.user.id } });
});
