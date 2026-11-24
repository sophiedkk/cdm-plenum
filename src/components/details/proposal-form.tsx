// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The structure proposal of an element (DT1): data type, cardinality and, for a coded text,
// ordinal or scale, the value list with its meanings and numbers. One save sends all three, so
// a revision is one new version for the group to answer. A reference to another model gets the
// cardinality only (EL26).
import { revalidateLogic } from "@tanstack/react-form";
import { PlusIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { z } from "zod";
import {
  DataTypeField,
  maxKindOptions,
  minOccursOptions,
  SelectField,
} from "@/components/board/element-fields";
import {
  type CardinalityValues,
  checkCardinality,
  fromCardinality,
  toCardinality,
} from "@/components/board/element-form";
import { parseValueNumber, valuesSchema } from "@/components/board/values-form";
import { useAppForm } from "@/components/form/app-form";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { CODED_DATA_TYPE_KEYS, isDataTypeKey } from "@/lib/data-types";
import type { DetailStructure } from "@/lib/details";
import { ELEMENT_VALUES_MAX } from "@/lib/elements";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { refusalMessage } from "@/lib/i18n/refusals";

interface FormValues extends CardinalityValues {
  dataType: string;
  values: { text: string; value: string }[];
}

function coded(dataType: string): boolean {
  return isDataTypeKey(dataType) && CODED_DATA_TYPE_KEYS.includes(dataType);
}

/** The checks of `proposeDetailInput` with translated messages; values only for a coded type. */
function proposalSchema() {
  return z
    .object({
      dataType: z.string(),
      minOccurs: z.string(),
      maxKind: z.string(),
      maxNumber: z.string(),
      values: z.array(z.object({ text: z.string(), value: z.string() })),
    })
    .superRefine((value, ctx) => {
      checkCardinality(value, ctx);
      if (!isDataTypeKey(value.dataType) || !coded(value.dataType)) return;
      const result = valuesSchema(value.dataType).safeParse({ values: value.values });
      for (const issue of result.error?.issues ?? []) {
        ctx.addIssue({ code: "custom", path: issue.path, message: issue.message });
      }
    });
}

function toStructure(values: FormValues): DetailStructure {
  const dataType = isDataTypeKey(values.dataType) ? values.dataType : null;
  const needsNumber = dataType !== "coded_text";
  return {
    dataType,
    cardinality: toCardinality(values),
    values: coded(values.dataType)
      ? values.values.map((entry) => ({
          text: entry.text.trim(),
          value: needsNumber ? parseValueNumber(entry.value) : null,
        }))
      : [],
  };
}

export function ProposalForm({
  reference = false,
  initial,
  submitLabel,
  submit,
  onDone,
  actions,
}: Readonly<{
  /** Whether the element refers to another model, which leaves out data type and values. */
  reference?: boolean;
  /** The structure to start from: the current proposal, or what the element carries now. */
  initial: DetailStructure;
  submitLabel: string;
  submit: (structure: DetailStructure) => Promise<Outcome<unknown>>;
  onDone: () => Promise<void> | void;
  actions?: ReactNode;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const form = useAppForm({
    defaultValues: {
      dataType: initial.dataType ?? "",
      ...fromCardinality(initial.cardinality),
      values: initial.values.map((value) => ({
        text: value.text,
        value: value.value === null ? "" : String(value.value),
      })),
    } satisfies FormValues as FormValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: proposalSchema() },
    onSubmit: async ({ value, formApi }) => {
      let outcome: Outcome<unknown>;
      try {
        outcome = await submit(toStructure(value));
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      await onDone();
    },
  });

  const focusText = (index: number) => {
    requestAnimationFrame(() => {
      const root = formRef.current;
      const target =
        root?.querySelector<HTMLElement>(`[name="values[${index}].text"]`) ??
        root?.querySelector<HTMLElement>("[data-add-value]");
      target?.focus();
    });
  };

  return (
    <form
      ref={formRef}
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
      {!reference && <form.AppField name="dataType">{() => <DataTypeField />}</form.AppField>}
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-1 font-medium">{m.board_cardinality_legend()}</legend>
        <p className="text-sm text-muted-foreground">{m.details_cardinality_hint()}</p>
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
      <form.Subscribe selector={(state) => state.values.dataType}>
        {(dataType) =>
          coded(dataType) && (
            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 font-medium">{m.board_field_values()}</legend>
              <form.AppField name="values" mode="array">
                {(list) => (
                  <>
                    {list.state.value.length > 0 && (
                      <ol className="flex flex-col gap-3">
                        {list.state.value.map((_, index) => {
                          const position = index + 1;
                          return (
                            // biome-ignore lint/suspicious/noArrayIndexKey: the rows are positions; the fields are named by index
                            <li key={index} className="rounded-lg border p-3">
                              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                                <form.AppField name={`values[${index}].text`}>
                                  {(field) => (
                                    <field.TextField
                                      label={m.board_value_text_label({ position })}
                                      autoComplete="off"
                                    />
                                  )}
                                </form.AppField>
                                {dataType !== "coded_text" && (
                                  <form.AppField name={`values[${index}].value`}>
                                    {(field) => (
                                      <field.TextField
                                        label={m.board_value_number_label({ position })}
                                        inputMode={dataType === "ordinal" ? "numeric" : "decimal"}
                                        autoComplete="off"
                                      />
                                    )}
                                  </form.AppField>
                                )}
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="mt-2"
                                onClick={() => {
                                  list.removeValue(index);
                                  focusText(Math.max(0, index - 1));
                                }}
                              >
                                <Trash2Icon aria-hidden="true" data-icon="inline-start" />
                                {m.board_value_remove({ position })}
                              </Button>
                            </li>
                          );
                        })}
                      </ol>
                    )}
                    <div>
                      <Button
                        type="button"
                        variant="outline"
                        data-add-value
                        disabled={list.state.value.length >= ELEMENT_VALUES_MAX}
                        onClick={() => {
                          const next = list.state.value.length;
                          list.pushValue({ text: "", value: "" });
                          focusText(next);
                        }}
                      >
                        <PlusIcon aria-hidden="true" data-icon="inline-start" />
                        {m.board_value_add()}
                      </Button>
                    </div>
                  </>
                )}
              </form.AppField>
            </fieldset>
          )
        }
      </form.Subscribe>
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{submitLabel}</form.SubmitButton>
        </form.AppForm>
        {actions}
      </div>
    </form>
  );
}
