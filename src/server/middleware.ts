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

/** One line per unexpected failure: the function name, the error class, message and stack. */
export function failureLine(name: string, error: unknown): string {
  const detail =
    error instanceof Error
      ? `${error.name} ${error.message}\n${error.stack ?? ""}`
      : `non-error thrown ${typeof error}`;
  return `server_function_failed fn=${name} ${detail}`.trimEnd();
}

// NOTE: next() rejects with what the handler or a later middleware throws (TanStack Start
// function middleware docs). The input is never logged (Q-PRIV-2); the sign-in refusal is expected.
export const logFailures = createMiddleware({ type: "function" }).server(
  async ({ next, serverFnMeta }) => {
    try {
      return await next();
    } catch (error) {
      if (!(error instanceof AuthError)) console.error(failureLine(serverFnMeta.name, error));
      throw error;
    }
  },
);

/** Requires a session; hands the user id, never more, to the handler. Also logs failures. */
export const requireSession = createMiddleware({ type: "function" })
  .middleware([logFailures])
  .server(async ({ next }) => {
    const session = await readSession(getAuth(), getDb(), getRequestHeaders());
    if (!session) throw new AuthError();
    return next({ context: { userId: session.user.id } });
  });
