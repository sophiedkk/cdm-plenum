// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import type { RefusalCode } from "@/lib/i18n/refusals";

/** What a server function of the members and administration pages answers. */
export type Outcome<T> = { ok: true; value: T } | { ok: false; error: RefusalCode };
