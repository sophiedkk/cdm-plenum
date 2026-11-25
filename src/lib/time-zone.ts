// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The reader's time zone (Q-I18N-1). The server cannot see it, so the browser stores it in a
// cookie and the root route hands it to every render as context. Server and client then format
// a moment from the same value, and a first visit without the cookie shows UTC, named as such.
import { createContext, useContext } from "react";

export const TIME_ZONE_COOKIE = "tz";
export const DEFAULT_TIME_ZONE = "UTC";

/** True when `value` is an IANA time zone this runtime knows. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** The zone in a `Cookie` header, or UTC when it is missing or not a zone. */
export function timeZoneFromCookies(header: string | null | undefined): string {
  for (const part of (header ?? "").split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== TIME_ZONE_COOKIE) continue;
    try {
      const value = decodeURIComponent(rest.join("="));
      if (isTimeZone(value)) return value;
    } catch {
      // A malformed escape means the cookie is not ours; fall through to UTC.
    }
  }
  return DEFAULT_TIME_ZONE;
}

/** The `Set-Cookie` text the browser writes for `timeZone`: a year, same site only. */
export function timeZoneCookie(timeZone: string): string {
  return `${TIME_ZONE_COOKIE}=${encodeURIComponent(timeZone)}; path=/; max-age=31536000; SameSite=Lax`;
}

const TimeZoneContext = createContext(DEFAULT_TIME_ZONE);
export const TimeZoneProvider = TimeZoneContext.Provider;

/** The time zone every moment on the page is shown in. */
export function useTimeZone(): string {
  return useContext(TimeZoneContext);
}
