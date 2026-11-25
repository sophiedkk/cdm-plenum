// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The rows of the Details list (P1): what each element asks of the viewer, and the order that
// puts those rows first, then the ones that wait, then the settled ones.
import { describe, expect, it } from "vitest";
import {
  elementRowState,
  listRows,
  nextToAnswer,
  treeRowState,
  type Viewer,
} from "./detail-list.ts";
import type {
  CodeProposal,
  DetailAnswer,
  DetailElement,
  DetailProposal,
  DetailStructure,
} from "./details.ts";

const STRUCTURE: DetailStructure = {
  dataType: "text",
  cardinality: { min: 1, max: 1 },
  values: [],
  units: [],
};

function proposal(
  settled: boolean,
  own: DetailAnswer | null = null,
  objections = 0,
): DetailProposal {
  return {
    id: "p",
    version: 1,
    settledAt: settled ? "2026-11-25T10:00:00Z" : null,
    own: own === null ? null : { answer: own, reason: own === "objection" ? "No." : null },
    answers: {
      agreed: 0,
      left: 0,
      objections: Array.from({ length: objections }, (_, index) => ({
        id: `o${index}`,
        version: 1,
        reason: "No.",
        addressedNote: null,
      })),
    },
    history: [],
    structure: STRUCTURE,
    proposedBy: "facilitator",
  };
}

function codes(
  settled: boolean,
  review: CodeProposal["review"]["state"] = "approved",
): CodeProposal {
  return {
    ...proposal(settled),
    codes: { code: null, bindingStrength: null, valueSetUrl: null, valueCodes: [] },
    proposedBy: "terminology",
    review: { state: review, note: null, ownProposal: false, skippable: false },
  };
}

function element(name: string, changes: Partial<DetailElement> = {}): DetailElement {
  return {
    id: name,
    name,
    description: "",
    reference: null,
    current: STRUCTURE,
    proposal: null,
    currentCodes: { code: null, bindingStrength: null, valueSetUrl: null, valueCodes: [] },
    codes: null,
    codesInReview: false,
    sources: [],
    flags: null,
    valueRound: null,
    ...changes,
  };
}

const participant: Viewer = { facilitator: false, mayAnswer: true, mayPropose: false, open: true };
const architect: Viewer = { ...participant, mayPropose: true };
const terminologist: Viewer = { ...participant, mayProposeCodes: true, mayReview: true };
const facilitator: Viewer = {
  facilitator: true,
  mayAnswer: false,
  mayPropose: true,
  mayProposeCodes: true,
  open: true,
};

describe("elementRowState", () => {
  it("asks a participant for an answer, then reports it", () => {
    expect(elementRowState(element("a", { proposal: proposal(false) }), participant)).toBe(
      "needs_answer",
    );
    expect(elementRowState(element("a", { proposal: proposal(false, "agree") }), participant)).toBe(
      "answered",
    );
    expect(
      elementRowState(element("a", { proposal: proposal(false, "objection") }), participant),
    ).toBe("answered");
    expect(elementRowState(element("a", { proposal: proposal(false, "leave") }), participant)).toBe(
      "left",
    );
  });

  it("has nothing for a participant before there is a proposal or once it is settled", () => {
    expect(elementRowState(element("a"), participant)).toBeNull();
    expect(elementRowState(element("a", { proposal: proposal(true) }), participant)).toBeNull();
  });

  it("asks the code proposal of a participant only after its review", () => {
    const settled = proposal(true);
    expect(
      elementRowState(
        element("a", { proposal: settled, codes: codes(false, "pending") }),
        participant,
      ),
    ).toBeNull();
    expect(
      elementRowState(element("a", { proposal: settled, codes: codes(false) }), participant),
    ).toBe("needs_answer");
  });

  it("puts an action before a report", () => {
    const state = elementRowState(
      element("a", { proposal: proposal(true), codes: codes(false) }),
      participant,
    );
    expect(state).toBe("needs_answer");
    const answered = proposal(false, "agree");
    expect(elementRowState(element("a", { proposal: answered }), participant)).toBe("answered");
  });

  it("asks an architect for a structure and a terminologist for codes", () => {
    expect(elementRowState(element("a"), architect)).toBe("to_propose");
    expect(elementRowState(element("a", { proposal: proposal(true) }), terminologist)).toBe(
      "to_propose_codes",
    );
    expect(
      elementRowState(
        element("a", { proposal: proposal(true), reference: { url: "x" } as never }),
        terminologist,
      ),
    ).toBeNull();
  });

  it("asks a terminologist to review a code proposal of someone else", () => {
    expect(
      elementRowState(
        element("a", { proposal: proposal(true), codes: codes(false, "pending") }),
        terminologist,
      ),
    ).toBe("to_review");
  });

  it("asks the facilitator to address an objection, then to settle, then to propose", () => {
    expect(elementRowState(element("a", { proposal: proposal(false, null, 1) }), facilitator)).toBe(
      "objection",
    );
    expect(elementRowState(element("a", { proposal: proposal(false) }), facilitator)).toBe(
      "to_settle",
    );
    expect(elementRowState(element("a"), facilitator)).toBe("to_propose");
    expect(
      elementRowState(element("a", { proposal: proposal(false) }), { ...facilitator, open: false }),
    ).toBeNull();
  });
});

describe("listRows", () => {
  const rows = [
    element("settled", { proposal: proposal(true), codes: codes(true) }),
    element("answered", { proposal: proposal(false, "agree") }),
    element("todo-1", { proposal: proposal(false) }),
    element("waiting"),
    element("todo-2", { proposal: proposal(false) }),
  ];

  it("puts what needs the participant first, then what waits, then the settled ones", () => {
    const list = listRows(rows, participant);
    expect(list.map((row) => [row.element.name, row.group])).toEqual([
      ["todo-1", "todo"],
      ["todo-2", "todo"],
      ["answered", "waiting"],
      ["waiting", "waiting"],
      ["settled", "done"],
    ]);
  });

  it("counts a reference element as done once its structure is settled", () => {
    const reference = element("ref", {
      proposal: proposal(true),
      reference: { url: "x" } as never,
    });
    expect(listRows([reference], participant)[0]?.group).toBe("done");
  });

  it("keeps a settled structure with open codes out of the done group", () => {
    const list = listRows([element("a", { proposal: proposal(true), codes: codes(false) })], {
      ...participant,
      mayAnswer: false,
    });
    expect(list[0]?.group).toBe("waiting");
  });

  it("finds the next element that needs the participant, not the current one", () => {
    const list = listRows(rows, participant);
    expect(nextToAnswer(list, "todo-1")).toBe("todo-2");
    expect(nextToAnswer(list, "todo-2")).toBe("todo-1");
    expect(nextToAnswer(listRows([rows[1] as DetailElement], participant), "answered")).toBeNull();
  });
});

describe("treeRowState", () => {
  it("asks an architect to propose a missing tree and a participant to answer an open one", () => {
    expect(treeRowState(null, { ...architect, exists: false })).toBe("to_propose");
    expect(treeRowState(null, { ...participant, exists: false })).toBeNull();
    expect(treeRowState(proposal(false), { ...participant, exists: true })).toBe("needs_answer");
    expect(treeRowState(proposal(false, "leave"), { ...participant, exists: true })).toBe("left");
    expect(treeRowState(proposal(true), { ...participant, exists: true })).toBeNull();
  });
});
