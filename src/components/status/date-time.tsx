// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { getLocale } from "@/i18n/runtime";

/** Formats an ISO moment for the active locale; `timeZone` defaults to the browser's own. */
export function formatDateTime(iso: string, timeZone?: string): string {
  // `dateStyle` cannot be combined with `timeZoneName`, so the parts are named one by one.
  return new Intl.DateTimeFormat(getLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    ...(timeZone === undefined ? {} : { timeZone, timeZoneName: "short" }),
  }).format(new Date(iso));
}

/**
 * A moment in the reader's own time zone. The server does not know that zone, so the first
 * render shows UTC with its name and the browser replaces it after hydration.
 */
export function DateTime({ value }: Readonly<{ value: string }>) {
  const [local, setLocal] = useState(false);
  useEffect(() => setLocal(true), []);
  return <time dateTime={value}>{formatDateTime(value, local ? undefined : "UTC")}</time>;
}
