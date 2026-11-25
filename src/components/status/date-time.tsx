// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { formatDateTime } from "@/components/rounds/format";
import { useTimeZone } from "@/lib/time-zone";

/**
 * A moment in the reader's time zone with the zone named, the one format for every timestamp a
 * person sees. Server and client render the same text, from the zone in the root context (src/lib/time-zone.ts).
 */
export function DateTime({ value }: Readonly<{ value: string }>) {
  const timeZone = useTimeZone();
  return <time dateTime={value}>{formatDateTime(value, timeZone)}</time>;
}
