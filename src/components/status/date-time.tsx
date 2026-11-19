// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useState } from "react";
import { getLocale } from "@/i18n/runtime";

/** Formats an ISO moment for the active locale; `timeZone` defaults to the browser's own. */
export function formatDateTime(iso: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(getLocale(), {
    dateStyle: "medium",
    timeStyle: "short",
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
