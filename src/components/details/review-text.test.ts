// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The review line on a code proposal (DT4): a skipped review shows its colon only when the
// reader gets the facilitator's reason after it.
import { describe, expect, it } from "vitest";
import { reviewText } from "./detail-card.tsx";

describe("reviewText", () => {
  it("ends the skip line with a colon when the note follows", () => {
    expect(reviewText("skipped", "Only one terminologist")).toBe(
      "Review skipped by the facilitator:",
    );
  });

  it("ends the skip line with a full stop when the reader gets no note", () => {
    expect(reviewText("skipped", null)).toBe("Review skipped by the facilitator.");
  });

  it("leaves the other states as they are", () => {
    expect(reviewText("pending", null)).toBe("Waits for review by a second terminologist.");
    expect(reviewText("returned", "Wrong system")).toBe("Sent back to the terminologist.");
  });
});
