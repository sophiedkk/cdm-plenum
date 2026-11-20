// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  ckmColumnShown,
  detailFieldsShown,
  PARTICIPANT_ACCESS,
  PARTICIPANT_WRITES,
  PROJECT_STEPS,
  participantAccess,
  preparesAhead,
  SOURCE_PHASE,
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
    // Steps in order: scope, brainstorm, board, rounds, export, members, settings.
    expect(table).toEqual([
      ["scope", ["comment", "hidden", "hidden", "hidden", "hidden", "read", "hidden"]],
      ["discover", ["read", "add", "comment", "hidden", "hidden", "read", "hidden"]],
      ["decide", ["read", "hidden", "read", "rate", "hidden", "read", "hidden"]],
      ["handoff", ["read", "hidden", "read", "read", "hidden", "read", "hidden"]],
    ]);
  });

  it("keeps the scope and the members visible to a participant in every phase", () => {
    for (const phase of PROJECT_PHASES) {
      for (const step of ["scope", "members"] as const) {
        expect(stepVisible("participant", phase, step)).toBe(true);
      }
    }
  });

  it("keeps the export and the settings from a participant in every phase (PR12)", () => {
    for (const phase of PROJECT_PHASES) {
      expect(stepVisible("participant", phase, "export")).toBe(false);
      expect(stepVisible("participant", phase, "settings")).toBe(false);
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

describe("detailFieldsShown (EL21)", () => {
  it("hides data type, cardinality and values in every phase until the detail phase exists", () => {
    expect(PROJECT_PHASES.map((phase) => [phase, detailFieldsShown(phase)])).toEqual([
      ["scope", false],
      ["discover", false],
      ["decide", false],
      ["handoff", false],
    ]);
  });
});

describe("ckmColumnShown (EX2)", () => {
  it("shows the board's CKM column from the decide phase on", () => {
    expect(PROJECT_PHASES.map((phase) => [phase, ckmColumnShown(phase)])).toEqual([
      ["scope", false],
      ["discover", false],
      ["decide", true],
      ["handoff", true],
    ]);
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
      ["source_suggest", ["discover"]],
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

describe("preparesAhead", () => {
  it("lets the facilitator prepare the source models before and during discover only", () => {
    expect(PROJECT_PHASES.filter((phase) => preparesAhead(phase, SOURCE_PHASE))).toEqual([
      "scope",
      "discover",
    ]);
  });
});
