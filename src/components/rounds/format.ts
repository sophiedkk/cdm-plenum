// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Numbers, percentages and moments in the active locale. A moment is shown in the reader's time
// zone (`useTimeZone`) with the zone named.
import { getLocale } from "@/i18n/runtime";

// NOTE: no spec governs this, our own design (owner decision 2026-11-25): English dates read day,
// month, year, so a moment is formatted as "en-GB"; Dutch is already in that order.
function dateLocale(): string {
  const locale = getLocale();
  return locale === "en" ? "en-GB" : locale;
}

/** A number with the locale's decimal sign: 7.5 is "7,5" in Dutch. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat(getLocale(), { maximumFractionDigits: 2 }).format(value);
}

/** A percentage with at most one decimal, from a value of 0 to 100. */
export function formatPercent(value: number): string {
  return new Intl.NumberFormat(getLocale(), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(value / 100);
}

/** A date and time with the zone name, such as "19 November 2026 at 17:00 CET" (Dutch: "19 november 2026 om 17:00 CET"). */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(dateLocale(), {
    // dateStyle and timeStyle refuse timeZoneName, so the parts are named one by one.
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
    timeZoneName: "short",
  }).format(new Date(iso));
}

/** A short day and date, such as "Thu 26 Nov", for a deadline in a list line. */
export function formatShortDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(dateLocale(), {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone,
  })
    .format(new Date(iso))
    .replace(/,/g, "");
}

/** The value of a `datetime-local` input for `iso` in `timeZone`, such as "2026-12-01T17:00". */
export function toLocalInput(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

/** The instant a `datetime-local` value names in the browser's time zone, or null. */
export function fromLocalInput(value: string): string | null {
  if (value === "") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
