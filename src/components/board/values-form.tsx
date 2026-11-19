// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The proposed values of a coded text, ordinal or scale element (EL9): an ordered list the
// facilitator edits with buttons, so the order changes without a mouse (Q-ACC-1).
import { revalidateLogic } from "@tanstack/react-form";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useRef } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { DataTypeKey } from "@/lib/data-types";
import { ELEMENT_VALUE_TEXT_MAX, ELEMENT_VALUES_MAX } from "@/lib/elements";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";

export interface ProposedValue {
  text: string;
  value: number | null;
}

export type ValuesOutcome = { ok: true } | { ok: false; error: RefusalCode };

/** Reads "2", "-1", "0.5" or the Dutch "0,5"; null for anything else. */
export function parseValueNumber(text: string): number | null {
  const trimmed = text.trim().replace(",", ".");
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

/**
 * The checks of `setElementValuesInput` and `valuesProblem` (src/server/elements/) with
 * translated messages: a text for each value, and a number for ordinal (an integer, as
 * DV_ORDINAL.value is an Integer) and scale (a Real) values.
 */
export function valuesSchema(dataType: DataTypeKey) {
  const needsNumber = dataType !== "coded_text";
  return z.object({
    values: z
      .array(
        z.object({
          text: z
            .string()
            .trim()
            .min(1, { error: () => m.board_value_text_required() })
            .max(ELEMENT_VALUE_TEXT_MAX, {
              error: () => m.board_text_too_long({ max: ELEMENT_VALUE_TEXT_MAX }),
            }),
          value: z.string(),
        }),
      )
      .max(ELEMENT_VALUES_MAX)
      .superRefine((values, ctx) => {
        if (!needsNumber) return;
        values.forEach((entry, index) => {
          const path = [index, "value"];
          if (entry.value.trim() === "") {
            ctx.addIssue({ code: "custom", path, message: m.board_value_number_required() });
            return;
          }
          const number = parseValueNumber(entry.value);
          if (number === null) {
            ctx.addIssue({ code: "custom", path, message: m.board_value_number_invalid() });
          } else if (dataType === "ordinal" && !Number.isInteger(number)) {
            ctx.addIssue({ code: "custom", path, message: m.board_value_number_integer() });
          }
        });
      }),
  });
}

export function ValuesForm({
  dataType,
  initial,
  save,
  onSaved,
  actions,
}: Readonly<{
  dataType: DataTypeKey;
  initial: readonly ProposedValue[];
  save: (values: ProposedValue[]) => Promise<ValuesOutcome>;
  onSaved: () => Promise<void> | void;
  actions?: ReactNode;
}>) {
  const needsNumber = dataType !== "coded_text";
  const formRef = useRef<HTMLFormElement>(null);
  const form = useAppForm({
    defaultValues: {
      values: initial.map((value) => ({
        text: value.text,
        value: value.value === null ? "" : String(value.value),
      })),
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: valuesSchema(dataType) },
    onSubmit: async ({ value, formApi }) => {
      const values = value.values.map((entry) => ({
        text: entry.text.trim(),
        value: needsNumber ? parseValueNumber(entry.value) : null,
      }));
      let outcome: ValuesOutcome;
      try {
        outcome = await save(values);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      await onSaved();
    },
  });

  /** Moves focus to a control of row `index` once the list has rendered. */
  const focusRow = (index: number, part: "text" | "button") => {
    requestAnimationFrame(() => {
      const root = formRef.current;
      if (!root) return;
      const target =
        part === "text"
          ? root.querySelector<HTMLElement>(`[name="values[${index}].text"]`)
          : root.querySelector<HTMLElement>(`[data-value-row="${index}"] button:not(:disabled)`);
      (target ?? root.querySelector<HTMLElement>("[data-add-value]"))?.focus();
    });
  };

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.AppField name="values" mode="array">
        {(list) => (
          <>
            {list.state.value.length === 0 ? (
              <p className="text-muted-foreground">{m.board_values_empty()}</p>
            ) : (
              <ol className="flex flex-col gap-3">
                {list.state.value.map((_, index) => {
                  const position = index + 1;
                  const last = index === list.state.value.length - 1;
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: the rows are positions; the fields are named by index
                    <li key={index} data-value-row={index} className="rounded-lg border p-3">
                      <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                        <form.AppField name={`values[${index}].text`}>
                          {(field) => (
                            <field.TextField
                              label={m.board_value_text_label({ position })}
                              autoComplete="off"
                            />
                          )}
                        </form.AppField>
                        {needsNumber && (
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
                      <div className="mt-2 flex gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={index === 0}
                          onClick={() => {
                            list.moveValue(index, index - 1);
                            focusRow(index - 1, "button");
                          }}
                        >
                          <ArrowUpIcon aria-hidden="true" data-icon="inline-start" />
                          {m.board_value_move_up({ position })}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={last}
                          onClick={() => {
                            list.moveValue(index, index + 1);
                            focusRow(index + 1, "button");
                          }}
                        >
                          <ArrowDownIcon aria-hidden="true" data-icon="inline-start" />
                          {m.board_value_move_down({ position })}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            list.removeValue(index);
                            focusRow(Math.max(0, index - 1), "text");
                          }}
                        >
                          <Trash2Icon aria-hidden="true" data-icon="inline-start" />
                          {m.board_value_remove({ position })}
                        </Button>
                      </div>
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
                  focusRow(next, "text");
                }}
              >
                <PlusIcon aria-hidden="true" data-icon="inline-start" />
                {m.board_value_add()}
              </Button>
            </div>
          </>
        )}
      </form.AppField>
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{m.board_values_save()}</form.SubmitButton>
        </form.AppForm>
        {actions}
      </div>
    </form>
  );
}
