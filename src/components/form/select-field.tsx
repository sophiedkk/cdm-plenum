// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { Field, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type BaseFieldProps, FieldFeedback, useFieldA11y } from "./field-a11y";
import { useFieldContext } from "./form-context";

/** One choice of a `SelectField`: the stored value and its visible text. */
export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

/**
 * A choice from a short list for a `string` value; an empty value shows `placeholder`. The
 * trigger carries the label, help text and error like a text field does.
 */
export function SelectField({
  label,
  description,
  className,
  options,
  placeholder,
}: BaseFieldProps & {
  readonly options: readonly SelectOption[];
  readonly placeholder?: string;
}) {
  const field = useFieldContext<string>();
  const a11y = useFieldA11y(field, description);
  return (
    <Field data-invalid={a11y.isInvalid} className={className}>
      <FieldLabel htmlFor={a11y.controlProps.id}>{label}</FieldLabel>
      <Select value={field.state.value} onValueChange={(value) => field.handleChange(value)}>
        <SelectTrigger
          id={a11y.controlProps.id}
          aria-invalid={a11y.controlProps["aria-invalid"]}
          aria-describedby={a11y.controlProps["aria-describedby"]}
          onBlur={field.handleBlur}
          className="w-full sm:w-80"
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <FieldFeedback a11y={a11y} description={description} />
    </Field>
  );
}
