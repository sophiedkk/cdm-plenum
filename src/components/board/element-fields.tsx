// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The fields of the element form that the shared form hook does not register: a native select
// and the data type picker. Each reads its field from the `form.AppField` around it, so it gets
// the same label, help text and error wiring as `field.TextField`.
import { useId } from "react";
import { type BaseFieldProps, FieldFeedback, useFieldA11y } from "@/components/form/field-a11y";
import { useFieldContext } from "@/components/form/form-context";
import { Field, FieldDescription, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { m } from "@/i18n/messages";
import { cn } from "@/lib/utils";
import { DATA_TYPE_KEYS, dataTypeHelp, dataTypeName, dataTypePair } from "./data-type-text";

/** The look of the shadcn `Input`, for a native `select`. */
export const SELECT_CLASS =
  "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2 py-1 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30";

/** A native select for a `string` value; a native control works with every assistive tool. */
export function SelectField({
  label,
  description,
  className,
  options,
}: BaseFieldProps & { readonly options: readonly { value: string; label: string }[] }) {
  const field = useFieldContext<string>();
  const a11y = useFieldA11y(field, description);
  return (
    <Field data-invalid={a11y.isInvalid} className={className}>
      <FieldLabel htmlFor={a11y.controlProps.id}>{label}</FieldLabel>
      <select
        {...a11y.controlProps}
        className={SELECT_CLASS}
        value={field.state.value}
        onBlur={field.handleBlur}
        onChange={(event) => field.handleChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <FieldFeedback a11y={a11y} description={description} />
    </Field>
  );
}

/**
 * The data type picker (EL1): "not decided" and the 17 types, each with its plain name, the
 * openEHR and FHIR type names (ADR 0009) and when to use it. Native radio buttons, so the arrow
 * keys move through the list.
 */
export function DataTypeField() {
  const field = useFieldContext<string>();
  const base = useId();
  const options = [
    { value: "", name: m.board_data_type_none(), pair: null, help: m.board_data_type_none_help() },
    ...DATA_TYPE_KEYS.map((key) => ({
      value: key,
      name: dataTypeName(key),
      pair: dataTypePair(key),
      help: dataTypeHelp(key),
    })),
  ];
  return (
    <FieldSet>
      <FieldLegend>{m.board_data_type_legend()}</FieldLegend>
      <FieldDescription id={`${base}hint`}>{m.board_data_type_hint()}</FieldDescription>
      <div className="flex max-h-80 flex-col gap-1 overflow-y-auto rounded-lg border p-1">
        {options.map((option) => {
          const id = `${base}${option.value || "none"}`;
          const checked = field.state.value === option.value;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className={cn(
                "flex cursor-pointer gap-3 rounded-md p-2 hover:bg-muted has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                checked && "bg-muted",
              )}
            >
              <input
                id={id}
                type="radio"
                name={field.name}
                value={option.value}
                checked={checked}
                aria-describedby={`${id}help`}
                onBlur={field.handleBlur}
                onChange={() => field.handleChange(option.value)}
                className="mt-1 size-4 shrink-0 accent-primary outline-none"
              />
              <span className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {option.name}
                  {option.pair && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">
                      {option.pair}
                    </span>
                  )}
                </span>
                <span id={`${id}help`} className="text-sm text-muted-foreground">
                  {option.help}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </FieldSet>
  );
}

/** The choices of the minimum (EL1): not decided, 0 or 1. */
export function minOccursOptions() {
  return [
    { value: "", label: m.board_not_decided() },
    { value: "0", label: m.board_min_0() },
    { value: "1", label: m.board_min_1() },
  ];
}

/** The choices of the maximum (EL1): not decided, 1, many, or a number typed below. */
export function maxKindOptions() {
  return [
    { value: "", label: m.board_not_decided() },
    { value: "1", label: m.board_max_1() },
    { value: "many", label: m.board_max_many() },
    { value: "number", label: m.board_max_number() },
  ];
}
