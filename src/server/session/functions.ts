// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The session server function the root route reads on every navigation. It answers `null`
// without a session instead of refusing, so the sign-in and invitation pages can call it too.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getAuth } from "../auth.ts";
import { getDb } from "../db/index.ts";
import { sessionUser } from "./queries.ts";
import { readSession } from "./read.ts";

export const getSessionFn = createServerFn({ method: "GET" }).handler(async () => {
  const session = await readSession(getAuth(), getDb(), getRequestHeaders());
  if (!session) return null;
  return sessionUser(getDb(), session.user.id);
});
