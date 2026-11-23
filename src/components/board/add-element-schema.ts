// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { z } from "zod";
import { m } from "@/i18n/messages";
import { ELEMENT_DESCRIPTION_MAX, ELEMENT_NAME_MAX } from "@/lib/elements";

/** An element another participant added, as a similar-name hint names it (EL16). */
export interface HintElement {
  id: string;
  name: string;
}

/** The limits of `addElementInput` (src/server/elements/schemas.ts), with translated messages. */
export function addElementSchema() {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => m.board_name_required() })
      .max(ELEMENT_NAME_MAX, { error: () => m.board_text_too_long({ max: ELEMENT_NAME_MAX }) }),
    description: z.string().max(ELEMENT_DESCRIPTION_MAX, {
      error: () => m.board_text_too_long({ max: ELEMENT_DESCRIPTION_MAX }),
    }),
  });
}
