// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  PARTICIPANT_ACCESS,
  PARTICIPANT_WRITES,
  PROJECT_STEPS,
  participantAccess,
  stepVisible,
  writeOpen,
} from "./phase-access.ts";
import { PROJECT_PHASES } from "./project-phases.ts";

describe("the phase table (PR9)", () => {
  it("has a row for every phase and an entry for every step", () => {
    expect(Object.keys(PARTICIPANT_ACCESS).sort()).toEqual([...PROJECT_PHASES].sort());
    for (const phase of PROJECT_PHASES) {
      expect(Object.keys(PARTICIPANT_ACCESS[phase]).sort()).toEqual([...PROJECT_STEPS].sort());
    }
  });

  it("gives a participant the access of PR9 per phase and step", () => {
    const table = PROJECT_PHASES.map((phase) => [
      phase,
      PROJECT_STEPS.map((step) => participantAccess(phase, step)),
    ]);
    // Steps in order: overview, scope, brainstorm, board, rounds, members.
    expect(table).toEqual([
      ["scope", ["read", "comment", "hidden", "hidden", "hidden", "read"]],
      ["discover", ["read", "read", "add", "comment", "hidden", "read"]],
      ["decide", ["read", "read", "hidden", "read", "rate", "read"]],
      ["handoff", ["read", "read", "hidden", "read", "read", "read"]],
    ]);
  });

  it("keeps the overview, the scope and the members visible to a participant in every phase", () => {
    for (const phase of PROJECT_PHASES) {
      for (const step of ["overview", "scope", "members"] as const) {
        expect(stepVisible("participant", phase, step)).toBe(true);
      }
    }
  });

  it("hides the steps that have not started from a participant", () => {
    expect(stepVisible("participant", "scope", "brainstorm")).toBe(false);
    expect(stepVisible("participant", "scope", "board")).toBe(false);
    expect(stepVisible("participant", "scope", "rounds")).toBe(false);
    expect(stepVisible("participant", "discover", "rounds")).toBe(false);
    expect(stepVisible("participant", "decide", "brainstorm")).toBe(false);
    expect(stepVisible("participant", "discover", "board")).toBe(true);
  });

  it("shows the facilitator every step in every phase (PR10)", () => {
    for (const phase of PROJECT_PHASES) {
      for (const step of PROJECT_STEPS) {
        expect(stepVisible("facilitator", phase, step)).toBe(true);
      }
    }
  });
});

describe("writeOpen", () => {
  it("opens each participant write in exactly one phase", () => {
    const open = Object.keys(PARTICIPANT_WRITES).map((write) => [
      write,
      PROJECT_PHASES.filter((phase) =>
        writeOpen("participant", phase, write as keyof typeof PARTICIPANT_WRITES),
      ),
    ]);
    expect(open).toEqual([
      ["scope_comment", ["scope"]],
      ["element_add", ["discover"]],
      ["element_comment", ["discover"]],
      ["element_mark", ["discover"]],
      ["rate", ["decide"]],
    ]);
  });

  it("never closes a write for the facilitator, who prepares ahead (PR10)", () => {
    for (const phase of PROJECT_PHASES) {
      for (const write of Object.keys(PARTICIPANT_WRITES)) {
        expect(writeOpen("facilitator", phase, write as keyof typeof PARTICIPANT_WRITES)).toBe(
          true,
        );
      }
    }
  });
});
