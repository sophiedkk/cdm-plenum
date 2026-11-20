// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { formatDateTime, useTimeZone } from "@/components/rounds/format";

/**
 * A moment in the reader's time zone with the zone named, the one format for every timestamp a
 * person sees. The server does not know that zone, so the first render shows UTC.
 */
export function DateTime({ value }: Readonly<{ value: string }>) {
  const timeZone = useTimeZone();
  return <time dateTime={value}>{formatDateTime(value, timeZone)}</time>;
}
