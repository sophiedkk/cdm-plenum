// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Server functions of the development sign-in page. They need no session: the page is where
// you get one. With DEV_SIGN_IN off they refuse as `not_found`.
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeaders } from "@tanstack/react-start/server";
import { getAuth } from "../auth.ts";
import { getDb } from "../db/index.ts";
import { devSignInEnabled, getEnv } from "../env.ts";
import { devSignInLink } from "./link.ts";
import { devSignInPeople } from "./queries.ts";
import { devSignInInput } from "./schemas.ts";

/** Whether the page is on; the client learns this one boolean and nothing else. */
export const devSignInEnabledFn = createServerFn({ method: "GET" }).handler(() =>
  devSignInEnabled(getEnv()),
);

export const devSignInPeopleFn = createServerFn({ method: "GET" }).handler(() =>
  devSignInPeople(getDb(), devSignInEnabled(getEnv())),
);

export const devSignInFn = createServerFn({ method: "POST" })
  .validator(devSignInInput)
  .handler(({ data }) =>
    devSignInLink(
      getAuth(),
      getDb(),
      devSignInEnabled(getEnv()),
      data.userId,
      new Headers(getRequestHeaders()),
    ),
  );
