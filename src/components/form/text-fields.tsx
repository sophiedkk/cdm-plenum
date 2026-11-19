// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import type { ComponentProps } from "react";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type BaseFieldProps, FieldFeedback, useFieldA11y } from "./field-a11y";
import { useFieldContext } from "./form-context";

type InputExtras = Pick<
  ComponentProps<"input">,
  "autoComplete" | "inputMode" | "maxLength" | "spellCheck" | "disabled"
>;

/** A one-line text field for a `string` value. */
export function TextField({
  label,
  description,
  className,
  type = "text",
  ...input
}: BaseFieldProps & InputExtras & { readonly type?: "text" | "email" | "url" | "search" }) {
  const field = useFieldContext<string>();
  const a11y = useFieldA11y(field, description);
  return (
    <Field data-invalid={a11y.isInvalid} className={className}>
      <FieldLabel htmlFor={a11y.controlProps.id}>{label}</FieldLabel>
      <Input
        {...input}
        {...a11y.controlProps}
        type={type}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      <FieldFeedback a11y={a11y} description={description} />
    </Field>
  );
}

/** A multi-line text field for a `string` value. */
export function TextareaField({
  label,
  description,
  className,
  ...textarea
}: BaseFieldProps & Pick<ComponentProps<"textarea">, "maxLength" | "rows" | "disabled">) {
  const field = useFieldContext<string>();
  const a11y = useFieldA11y(field, description);
  return (
    <Field data-invalid={a11y.isInvalid} className={className}>
      <FieldLabel htmlFor={a11y.controlProps.id}>{label}</FieldLabel>
      <Textarea
        {...textarea}
        {...a11y.controlProps}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      />
      <FieldFeedback a11y={a11y} description={description} />
    </Field>
  );
}
