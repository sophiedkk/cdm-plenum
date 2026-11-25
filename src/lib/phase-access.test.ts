// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import {
  ckmColumnShown,
  detailFieldsShown,
  facilitatorAccess,
  PARTICIPANT_ACCESS,
  PARTICIPANT_WRITES,
  PROJECT_STEPS,
  participantAccess,
  preparesAhead,
  ratingWriteOf,
  roundPhaseOf,
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
    // Steps in order: scope, brainstorm, board, rounds, export, members, settings, models,
    // first_look, grouping, group_check, details, handoff.
    const H = "hidden";
    expect(table).toEqual([
      ["scope", ["comment", H, H, H, H, "read", H, H, H, H, H, H, H]],
      ["discover", ["read", "add", "comment", H, H, "read", H, H, "answer", H, "answer", H, H]],
      ["decide", ["read", H, "read", "rate", H, "read", H, H, H, H, H, H, H]],
      ["detail", ["read", H, "read", "read", H, "read", H, H, H, H, H, "answer", H]],
      ["handoff", ["read", H, "read", "read", H, "read", H, H, H, H, H, "read", "read"]],
    ]);
  });

  it("keeps the scope and the members visible to a participant in every phase", () => {
    for (const phase of PROJECT_PHASES) {
      for (const step of ["scope", "members"] as const) {
        expect(stepVisible("participant", phase, step)).toBe(true);
      }
    }
  });

  it("shows the hand-off page to a participant in hand-off only, to the facilitator always (PR4)", () => {
    for (const phase of PROJECT_PHASES) {
      expect(stepVisible("participant", phase, "handoff")).toBe(phase === "handoff");
      expect(stepVisible("facilitator", phase, "handoff")).toBe(true);
    }
  });

  it("keeps the export and the settings from a participant in every phase (PR12)", () => {
    for (const phase of PROJECT_PHASES) {
      expect(stepVisible("participant", phase, "export")).toBe(false);
      expect(stepVisible("participant", phase, "settings")).toBe(false);
    }
  });

  it("keeps the existing models page from a participant in every phase (EL12)", () => {
    for (const phase of PROJECT_PHASES) {
      expect(stepVisible("participant", phase, "models")).toBe(false);
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
  it("shows data type, cardinality and values from the detail phase on", () => {
    expect(PROJECT_PHASES.map((phase) => [phase, detailFieldsShown(phase)])).toEqual([
      ["scope", false],
      ["discover", false],
      ["decide", false],
      ["detail", true],
      ["handoff", true],
    ]);
  });
});

describe("ckmColumnShown (EX2)", () => {
  it("shows the board's CKM column from the discover phase on", () => {
    expect(PROJECT_PHASES.map((phase) => [phase, ckmColumnShown(phase)])).toEqual([
      ["scope", false],
      ["discover", true],
      ["decide", true],
      ["detail", true],
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
      ["value_rate", ["detail"]],
      ["source_suggest", ["discover"]],
      ["first_look_answer", ["discover"]],
      ["group_remark", ["discover"]],
      ["detail_answer", ["detail"]],
      ["detail_propose", ["detail"]],
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

describe("rating per round kind (DT3)", () => {
  it("opens rating in an element round in decide and in a value round in detail only", () => {
    const rating = (kind: "elements" | "values") =>
      PROJECT_PHASES.filter((phase) => writeOpen("participant", phase, ratingWriteOf(kind)));
    expect(rating("elements")).toEqual(["decide"]);
    expect(rating("values")).toEqual(["detail"]);
    expect(roundPhaseOf("elements")).toBe("decide");
    expect(roundPhaseOf("values")).toBe("detail");
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

describe("facilitatorAccess (F3)", () => {
  const reads = (step: (typeof PROJECT_STEPS)[number]) =>
    PROJECT_PHASES.filter((phase) => facilitatorAccess(phase, step) === "read");

  it("reads a step once the project is past its last editing phase", () => {
    expect(reads("scope")).toEqual(["discover", "decide", "detail", "handoff"]);
    expect(reads("models")).toEqual(["decide", "detail", "handoff"]);
    expect(reads("brainstorm")).toEqual(["decide", "detail", "handoff"]);
    expect(reads("grouping")).toEqual(["decide", "detail", "handoff"]);
    expect(reads("board")).toEqual(["detail", "handoff"]);
    expect(reads("rounds")).toEqual(["detail", "handoff"]);
    expect(reads("details")).toEqual(["handoff"]);
  });

  it("keeps a step editable ahead of its phase, as the facilitator prepares ahead (PR10)", () => {
    expect(facilitatorAccess("scope", "rounds")).toBe("edit");
    expect(facilitatorAccess("scope", "board")).toBe("edit");
    expect(facilitatorAccess("discover", "details")).toBe("edit");
  });

  it("never closes the people, settings and export steps", () => {
    for (const step of ["members", "settings", "export", "handoff"] as const) {
      expect(reads(step)).toEqual([]);
    }
  });
});
