// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Numbers, percentages and moments in the active locale. A moment is shown in the browser's time
// zone with the zone named; the server render uses UTC until the page hydrates.
import { useSyncExternalStore } from "react";
import { getLocale } from "@/i18n/runtime";

const noSubscription = () => () => {};

/** The browser's IANA time zone, or "UTC" during the server render. */
export function useTimeZone(): string {
  return useSyncExternalStore(
    noSubscription,
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    () => "UTC",
  );
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

/** A date and time with the zone name, such as "19 November 2026, 17:00 CET". */
export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
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
