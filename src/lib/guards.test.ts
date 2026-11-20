// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Route guards steer navigation by session and application role (PR1, AD1).
import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import type { SessionUser } from "@/server/session/queries";
import { hasAppRole, requireAppRole, requireStep, requireUser } from "./guards.ts";

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

describe("requireStep (PR9, PR10)", () => {
  const params = { projectId: "0190a8f0-0000-7000-8000-000000000000" };

  it("sends a participant from a hidden step to the project, which opens their current step", () => {
    const error = thrown(() =>
      requireStep("rounds")({
        context: { project: { role: "participant", phase: "discover" } },
        params,
      }),
    );
    expect(isRedirect(error) && error.options.to).toBe("/projects/$projectId");
    expect(isRedirect(error) && error.options.params).toEqual(params);
  });

  it("lets a participant open a step the phase shows", () => {
    const context = { project: { role: "participant", phase: "discover" } } as const;
    expect(thrown(() => requireStep("board")({ context, params }))).toBeUndefined();
    expect(thrown(() => requireStep("scope")({ context, params }))).toBeUndefined();
  });

  it("sends a participant from the export and the settings to the project", () => {
    const context = { project: { role: "participant", phase: "handoff" } } as const;
    for (const step of ["export", "settings"] as const) {
      const error = thrown(() => requireStep(step)({ context, params }));
      expect(isRedirect(error) && error.options.to).toBe("/projects/$projectId");
    }
  });

  it("lets the facilitator open every step in any phase", () => {
    const context = { project: { role: "facilitator", phase: "scope" } } as const;
    expect(thrown(() => requireStep("rounds")({ context, params }))).toBeUndefined();
    expect(thrown(() => requireStep("brainstorm")({ context, params }))).toBeUndefined();
  });
});
