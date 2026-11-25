// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { consentCounts, consentNeedsReason, consentOutcome } from "./consent";

describe("consentOutcome (DE20)", () => {
  it("includes an element when every answer is Include", () => {
    expect(consentOutcome(["include", "include", "include"])).toBe("included");
  });

  it("excludes an element when every answer is Leave out", () => {
    expect(consentOutcome(["leave_out", "leave_out"])).toBe("excluded");
  });

  it("leaves any mix to discuss", () => {
    expect(consentOutcome(["include", "leave_out"])).toBe("no_consensus");
    expect(consentOutcome(["include", "include", "discuss"])).toBe("no_consensus");
    expect(consentOutcome(["leave_out", "discuss"])).toBe("no_consensus");
    expect(consentOutcome(["discuss"])).toBe("no_consensus");
  });

  it("does not count Unable to judge", () => {
    expect(consentOutcome(["include", "abstain", "include"])).toBe("included");
    expect(consentOutcome(["leave_out", "abstain"])).toBe("excluded");
    expect(consentOutcome(["abstain", "include", "discuss"])).toBe("no_consensus");
  });

  it("leaves an element nobody answered, or everybody abstained on, to discuss", () => {
    expect(consentOutcome([])).toBe("no_consensus");
    expect(consentOutcome(["abstain", "abstain"])).toBe("no_consensus");
  });
});

describe("consent answers", () => {
  it("counts each answer", () => {
    expect(consentCounts(["include", "discuss", "include", "abstain"])).toEqual({
      include: 2,
      leave_out: 0,
      discuss: 1,
      abstain: 1,
    });
  });

  it("asks a reason for Leave out and Discuss only", () => {
    expect(consentNeedsReason("leave_out")).toBe(true);
    expect(consentNeedsReason("discuss")).toBe(true);
    expect(consentNeedsReason("include")).toBe(false);
    expect(consentNeedsReason("abstain")).toBe(false);
  });
});
