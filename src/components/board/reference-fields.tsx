// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The choice "refers to another model" of the add and edit forms (EL26): a checkbox, and below it
// the model's title and link once it is ticked, so no control above them moves. The forms keep
// the three values in their own state; these helpers check them and turn them into a reference.
import { useId } from "react";
import { z } from "zod";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { m } from "@/i18n/messages";
import {
  type ElementReference,
  isReferenceUrl,
  REFERENCE_TITLE_MAX,
  REFERENCE_URL_MAX,
} from "@/lib/elements";

/** The reference as a form holds it. */
export interface ReferenceValues {
  refers: boolean;
  referenceTitle: string;
  referenceUrl: string;
}

export function fromReference(reference: ElementReference | null): ReferenceValues {
  return {
    refers: reference !== null,
    referenceTitle: reference?.title ?? "",
    referenceUrl: reference?.url ?? "",
  };
}

/** The form fields of the reference, for a form schema to extend. */
export const referenceShape = {
  refers: z.boolean(),
  referenceTitle: z.string(),
  referenceUrl: z.string(),
};

/** The reference of the form, or null for a data element. */
export function toReference(values: ReferenceValues): ElementReference | null {
  if (!values.refers) return null;
  const url = values.referenceUrl.trim();
  return { title: values.referenceTitle.trim(), url: url === "" ? null : url };
}

/**
 * The checks of `referenceSchema` (src/server/elements/schemas.ts) with translated messages: a
 * title, and a link only as an http or https address. Nothing is checked while not ticked.
 */
export function checkReference(values: ReferenceValues, ctx: z.RefinementCtx): void {
  if (!values.refers) return;
  const title = values.referenceTitle.trim();
  if (title === "") {
    ctx.addIssue({
      code: "custom",
      path: ["referenceTitle"],
      message: m.board_reference_title_required(),
    });
  } else if (title.length > REFERENCE_TITLE_MAX) {
    ctx.addIssue({
      code: "custom",
      path: ["referenceTitle"],
      message: m.board_text_too_long({ max: REFERENCE_TITLE_MAX }),
    });
  }
  const url = values.referenceUrl.trim();
  if (url !== "" && (!isReferenceUrl(url) || url.length > REFERENCE_URL_MAX)) {
    ctx.addIssue({
      code: "custom",
      path: ["referenceUrl"],
      message: m.board_reference_url_invalid({ max: REFERENCE_URL_MAX }),
    });
  }
}

/** The checkbox that opens the title and link fields below it. */
export function ReferenceChoice({
  checked,
  onChange,
}: Readonly<{ checked: boolean; onChange: (checked: boolean) => void }>) {
  const id = useId();
  return (
    <Field orientation="horizontal">
      <Checkbox id={id} checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      <FieldLabel htmlFor={id} className="font-normal">
        {m.board_reference_choice()}
      </FieldLabel>
    </Field>
  );
}
