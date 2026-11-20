// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { afterEach, describe, expect, it } from "vitest";
import { baseLocale, overwriteGetLocale } from "@/i18n/runtime";
import {
  formatDateTime,
  formatNumber,
  formatPercent,
  formatShortDate,
  toLocalInput,
} from "./format";

afterEach(() => overwriteGetLocale(() => baseLocale));

describe("round formats", () => {
  it("names the time zone of a moment", () => {
    expect(formatDateTime("2026-12-01T16:00:00Z", "Europe/Amsterdam")).toMatch(
      /December 1?,? ?2026.*17:00.*(CET|GMT\+1)/,
    );
  });

  it("writes Dutch numbers with a decimal comma", () => {
    overwriteGetLocale(() => "nl");
    expect(formatNumber(7.5)).toBe("7,5");
    expect(formatPercent(66.67)).toMatch(/^66,7\s?%$/);
    expect(formatDateTime("2026-12-01T16:00:00Z", "Europe/Amsterdam")).toMatch(/1 december 2026/);
  });

  it("writes a short day and date in the reader's zone, without commas", () => {
    expect(formatShortDate("2026-11-26T22:05:00Z", "UTC")).toBe("Thu Nov 26");
    // 23:05 in Amsterdam is still Thursday; 01:05 the next morning is Friday.
    expect(formatShortDate("2026-11-27T00:05:00Z", "Europe/Amsterdam")).toBe("Fri Nov 27");
    overwriteGetLocale(() => "nl");
    expect(formatShortDate("2026-11-26T22:05:00Z", "UTC")).toMatch(/^do\.? 26 nov\.?$/);
  });

  it("gives the datetime-local value of a moment in a zone", () => {
    expect(toLocalInput("2026-12-01T16:00:00Z", "Europe/Amsterdam")).toBe("2026-12-01T17:00");
    expect(toLocalInput("2026-07-01T16:00:00Z", "UTC")).toBe("2026-07-01T16:00");
  });
});
