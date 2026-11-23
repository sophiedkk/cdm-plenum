// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { startingPrompt } from "./source-placement.ts";

describe("startingPrompt (EL18, ADR 0020)", () => {
  it("places openEHR data, state and protocol under the matching question", () => {
    expect(startingPrompt("ckm", "/data[at0001]/events[at0006]/data[at0003]/items[at0004]")).toBe(
      "recorded",
    );
    expect(startingPrompt("ckm", "/data[at0001]/events[at0006]/state[at0007]/items[at0008]")).toBe(
      "patient_state",
    );
    expect(startingPrompt("ckm", "/protocol[at0011]/items[at0013]")).toBe("method");
  });

  it("places every FHIR and zib element under what is recorded", () => {
    expect(startingPrompt("fhir", "Observation.bodySite")).toBe("recorded");
    expect(startingPrompt("zib", "Observation.component:systolic")).toBe("recorded");
  });

  it("leaves an unknown place and other sources ungrouped", () => {
    expect(startingPrompt("ckm", "at0004")).toBeNull();
    expect(startingPrompt("ckm", "/description[at0001]/items[at0002]")).toBeNull();
    expect(startingPrompt("other", "/data[at0001]")).toBeNull();
  });
});
