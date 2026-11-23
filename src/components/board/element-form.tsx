// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { revalidateLogic } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { m } from "@/i18n/messages";
import type { Cardinality } from "@/lib/cardinality";
import { type DataTypeKey, isDataTypeKey } from "@/lib/data-types";
import { ELEMENT_DESCRIPTION_MAX, ELEMENT_NAME_MAX } from "@/lib/elements";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import { DataTypeField, maxKindOptions, minOccursOptions, SelectField } from "./element-fields";

/** What the form sends: the fields of `addElementInput` and `updateElementInput`. */
export interface ElementFields {
  name: string;
  description: string;
  dataType: DataTypeKey | null;
  cardinality: Cardinality | null;
}

export type ElementOutcome = { ok: true } | { ok: false; error: RefusalCode };

/** The cardinality as the form holds it: a minimum, the kind of maximum and its number. */
export interface CardinalityValues {
  minOccurs: string;
  maxKind: string;
  maxNumber: string;
}

interface FormValues extends CardinalityValues {
  name: string;
  description: string;
  dataType: string;
}

const textLimit = (max: number) =>
  z.string().max(max, { error: () => m.board_text_too_long({ max }) });

/**
 * The limits of `addElementInput` and `updateElementInput` (src/server/elements/schemas.ts)
 * with translated messages, and the cardinality of EL1: both parts or neither. Call it during
 * render, so the messages follow the active locale.
 */
export function elementFormSchema() {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, { error: () => m.board_name_required() })
        .max(ELEMENT_NAME_MAX, { error: () => m.board_text_too_long({ max: ELEMENT_NAME_MAX }) }),
      description: textLimit(ELEMENT_DESCRIPTION_MAX),
      dataType: z.string(),
      minOccurs: z.string(),
      maxKind: z.string(),
      maxNumber: z.string(),
    })
    .superRefine(checkCardinality);
}

/** The cardinality of EL1 with translated messages: both parts or neither, and a valid maximum. */
export function checkCardinality(value: CardinalityValues, ctx: z.RefinementCtx): void {
  if ((value.minOccurs === "") !== (value.maxKind === "")) {
    ctx.addIssue({
      code: "custom",
      path: [value.minOccurs === "" ? "minOccurs" : "maxKind"],
      message: m.board_cardinality_incomplete(),
    });
  }
  if (value.maxKind === "number" && !/^[1-9][0-9]{0,8}$/.test(value.maxNumber.trim())) {
    ctx.addIssue({ code: "custom", path: ["maxNumber"], message: m.board_max_number_invalid() });
  }
}

/** The cardinality of the form's three cardinality fields, or null while not decided. */
export function toCardinality(values: CardinalityValues): Cardinality | null {
  if (values.minOccurs === "" || values.maxKind === "") return null;
  const min = values.minOccurs === "1" ? 1 : 0;
  if (values.maxKind === "many") return { min, max: null };
  if (values.maxKind === "1") return { min, max: 1 };
  return { min, max: Number(values.maxNumber.trim()) };
}

/** The three cardinality fields of a cardinality. */
export function fromCardinality(cardinality: Cardinality | null): CardinalityValues {
  if (cardinality === null) return { minOccurs: "", maxKind: "", maxNumber: "" };
  const { min, max } = cardinality;
  if (max === null) return { minOccurs: String(min), maxKind: "many", maxNumber: "" };
  if (max === 1) return { minOccurs: String(min), maxKind: "1", maxNumber: "" };
  return { minOccurs: String(min), maxKind: "number", maxNumber: String(max) };
}

/**
 * The element form. Adding asks for a name and a description only (EL1, EL21); editing (EL5, the
 * facilitator's) also sets the data type and the cardinality while `detailFields` shows them.
 * Without them the form keeps their saved values. A refusal from the server shows at the top of
 * the form; a failed call shows the general error there.
 */
export function ElementForm({
  initial,
  mode,
  detailFields = false,
  submitLabel,
  submit,
  onDone,
  actions,
}: Readonly<{
  initial?: ElementFields;
  mode: "add" | "edit";
  /** Whether the phase shows data type and cardinality (EL21, `detailFieldsShown`). */
  detailFields?: boolean;
  submitLabel: string;
  submit: (fields: ElementFields) => Promise<ElementOutcome>;
  onDone: (fields: ElementFields) => Promise<void> | void;
  actions?: ReactNode;
}>) {
  const form = useAppForm({
    defaultValues: {
      name: initial?.name ?? "",
      description: initial?.description ?? "",
      dataType: initial?.dataType ?? "",
      ...fromCardinality(initial?.cardinality ?? null),
    } satisfies FormValues as FormValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: elementFormSchema() },
    onSubmit: async ({ value, formApi }) => {
      const fields: ElementFields = {
        name: value.name.trim(),
        description: value.description.trim(),
        dataType: isDataTypeKey(value.dataType) ? value.dataType : null,
        cardinality: toCardinality(value),
      };
      let outcome: ElementOutcome;
      try {
        outcome = await submit(fields);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      await onDone(fields);
    },
  });

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.AppField name="name">
        {(field) => (
          <field.TextField
            label={m.board_name_label()}
            description={m.board_name_description({ max: ELEMENT_NAME_MAX })}
            autoComplete="off"
          />
        )}
      </form.AppField>
      <form.AppField name="description">
        {(field) => (
          <field.TextareaField
            label={m.board_description_label()}
            description={m.board_description_description({ max: ELEMENT_DESCRIPTION_MAX })}
            rows={3}
          />
        )}
      </form.AppField>
      {mode === "edit" && detailFields && (
        <>
          <form.AppField name="dataType">{() => <DataTypeField />}</form.AppField>
          <fieldset className="flex flex-col gap-3">
            <legend className="mb-1 font-medium">{m.board_cardinality_legend()}</legend>
            <p className="text-sm text-muted-foreground">{m.board_cardinality_hint()}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <form.AppField name="minOccurs">
                {() => <SelectField label={m.board_min_label()} options={minOccursOptions()} />}
              </form.AppField>
              <form.AppField name="maxKind">
                {() => <SelectField label={m.board_max_label()} options={maxKindOptions()} />}
              </form.AppField>
            </div>
            <form.Subscribe selector={(state) => state.values.maxKind}>
              {(maxKind) =>
                maxKind === "number" && (
                  <form.AppField name="maxNumber">
                    {(field) => (
                      <field.TextField
                        label={m.board_max_number_label()}
                        inputMode="numeric"
                        autoComplete="off"
                      />
                    )}
                  </form.AppField>
                )
              }
            </form.Subscribe>
          </fieldset>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{submitLabel}</form.SubmitButton>
        </form.AppForm>
        {actions}
      </div>
    </form>
  );
}
