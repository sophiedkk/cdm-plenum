// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Route guards steer navigation by session and application role (PR1, AD1).
import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/session/queries";
import { hasAppRole, requireAppRole, requireUser } from "./guards.ts";

const user: SessionUser = {
  id: "user-fac",
  name: "",
  email: "fac@example.test",
  appRoles: ["facilitator"],
};

function thrown(run: () => unknown): unknown {
  try {
    run();
  } catch (error) {
    return error;
  }
  return undefined;
}

describe("route guards", () => {
  it("send a visitor without a session to the sign-in page", () => {
    const error = thrown(() => requireUser({ context: { user: null } }));
    expect(isRedirect(error) && error.options.to).toBe("/sign-in");
  });

  it("pass the signed-in user on", () => {
    expect(requireUser({ context: { user } })).toEqual({ user });
  });

  it("send a user without the application role to their projects", () => {
    const error = thrown(() => requireAppRole("administrator")({ context: { user } }));
    expect(isRedirect(error) && error.options.to).toBe("/projects");
    expect(thrown(() => requireAppRole("facilitator")({ context: { user } }))).toBeUndefined();
  });

  it("read application roles, and none without a session", () => {
    expect(hasAppRole(user, "facilitator")).toBe(true);
    expect(hasAppRole(user, "administrator")).toBe(false);
    expect(hasAppRole(null, "facilitator")).toBe(false);
  });
});
