// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from "vitest";
import { isTimeZone, timeZoneCookie, timeZoneFromCookies } from "./time-zone";

describe("time zone cookie", () => {
  it("reads the zone from a Cookie header", () => {
    expect(timeZoneFromCookies("a=1; tz=Europe%2FAmsterdam; b=2")).toBe("Europe/Amsterdam");
  });

  it("falls back to UTC for a missing or invalid zone", () => {
    expect(timeZoneFromCookies(null)).toBe("UTC");
    expect(timeZoneFromCookies("a=1")).toBe("UTC");
    expect(timeZoneFromCookies("tz=Not%2FAZone")).toBe("UTC");
    expect(timeZoneFromCookies("tz=%E0%A4%A")).toBe("UTC");
  });

  it("writes a cookie that reads back", () => {
    const written = timeZoneCookie("America/New_York").split(";")[0] ?? "";
    expect(timeZoneFromCookies(written)).toBe("America/New_York");
    expect(isTimeZone("Europe/Amsterdam")).toBe(true);
  });
});
