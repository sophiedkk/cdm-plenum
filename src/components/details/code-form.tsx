// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The code proposal of an element (DT4, DT5): the element code, the binding strength with an
// optional value set, and a code per value of the settled list. Each code is a system from a short
// list or a typed URI, a code and an optional display (owner decision 2026-11-23: typed, no
// lookup). One save sends it all, so a revision is one new version to review.
import { revalidateLogic } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { z } from "zod";
import { SelectField } from "@/components/board/element-fields";
import { useAppForm } from "@/components/form/app-form";
import { m } from "@/i18n/messages";
import {
  BINDING_STRENGTHS,
  CODE_DISPLAY_MAX,
  CODE_MAX,
  CODE_SYSTEM_MAX,
  CODE_SYSTEMS,
  type DetailCode,
  type DetailCodes,
  type DetailValue,
  isBindingStrength,
  VALUE_SET_URL_MAX,
} from "@/lib/details";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { refusalMessage } from "@/lib/i18n/refusals";
import { bindingLabel } from "./code-facts";

/** A code as the form holds it: a system choice (a known key, "other" or none), a URI and texts. */
interface CodeValues {
  system: string;
  uri: string;
  code: string;
  display: string;
}

interface FormValues {
  element: CodeValues;
  binding: string;
  valueSet: string;
  values: CodeValues[];
}

function fromCode(code: DetailCode | null): CodeValues {
  if (code === null) return { system: "", uri: "", code: "", display: "" };
  const known = CODE_SYSTEMS.find((system) => system.uri === code.system);
  return {
    system: known?.key ?? "other",
    uri: known ? "" : code.system,
    code: code.code,
    display: code.display ?? "",
  };
}

function toCode(values: CodeValues): DetailCode | null {
  if (values.system === "") return null;
  const known = CODE_SYSTEMS.find((system) => system.key === values.system);
  const display = values.display.trim();
  return {
    system: known?.uri ?? values.uri.trim(),
    code: values.code.trim(),
    display: display === "" ? null : display,
  };
}

const isUrl = (text: string) => z.string().url().safeParse(text.trim()).success;

/** The checks of `proposeCodesInput` with translated messages. */
function codeFormSchema() {
  const code = z.object({
    system: z.string(),
    uri: z.string(),
    code: z.string(),
    display: z.string(),
  });
  const checkCode = (value: CodeValues, path: (string | number)[], ctx: z.RefinementCtx) => {
    if (value.system === "") return;
    if (value.system === "other" && !isUrl(value.uri)) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "uri"],
        message: m.details_system_uri_invalid(),
      });
    } else if (value.uri.trim().length > CODE_SYSTEM_MAX) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "uri"],
        message: m.board_text_too_long({ max: CODE_SYSTEM_MAX }),
      });
    }
    if (value.code.trim() === "") {
      ctx.addIssue({ code: "custom", path: [...path, "code"], message: m.details_code_required() });
    } else if (value.code.trim().length > CODE_MAX) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "code"],
        message: m.board_text_too_long({ max: CODE_MAX }),
      });
    }
    if (value.display.trim().length > CODE_DISPLAY_MAX) {
      ctx.addIssue({
        code: "custom",
        path: [...path, "display"],
        message: m.board_text_too_long({ max: CODE_DISPLAY_MAX }),
      });
    }
  };
  return z
    .object({ element: code, binding: z.string(), valueSet: z.string(), values: z.array(code) })
    .superRefine((value, ctx) => {
      checkCode(value.element, ["element"], ctx);
      for (const [index, entry] of value.values.entries()) checkCode(entry, ["values", index], ctx);
      const url = value.valueSet.trim();
      if (url !== "" && (!isUrl(url) || url.length > VALUE_SET_URL_MAX)) {
        ctx.addIssue({
          code: "custom",
          path: ["valueSet"],
          message: m.details_value_set_invalid(),
        });
      }
    });
}

function systemOptions() {
  return [
    { value: "", label: m.details_no_code() },
    ...CODE_SYSTEMS.map((system) => ({ value: system.key, label: system.label })),
    { value: "other", label: m.details_system_other() },
  ];
}

export function CodeForm({
  initial,
  values,
  submitLabel,
  submit,
  onDone,
  actions,
}: Readonly<{
  /** The codes to start from: the current proposal, or what the element carries now. */
  initial: DetailCodes;
  /** The settled value list, one code each. */
  values: readonly DetailValue[];
  submitLabel: string;
  submit: (codes: DetailCodes) => Promise<Outcome<unknown>>;
  onDone: () => Promise<void> | void;
  actions?: ReactNode;
}>) {
  const form = useAppForm({
    defaultValues: {
      element: fromCode(initial.code),
      binding: initial.bindingStrength ?? "",
      valueSet: initial.valueSetUrl ?? "",
      values: values.map((_, index) => fromCode(initial.valueCodes[index] ?? null)),
    } satisfies FormValues as FormValues,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: codeFormSchema() },
    onSubmit: async ({ value, formApi }) => {
      const valueSet = value.valueSet.trim();
      const codes: DetailCodes = {
        code: toCode(value.element),
        bindingStrength: isBindingStrength(value.binding) ? value.binding : null,
        valueSetUrl: valueSet === "" ? null : valueSet,
        valueCodes: value.values.map(toCode),
      };
      let outcome: Outcome<unknown>;
      try {
        outcome = await submit(codes);
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

  /**
   * The fields of one code: `prefix` names it in the form, `pick` reads it from the form's
   * values, `legend` names it for the reader.
   */
  const codeFields = (
    prefix: "element" | `values[${number}]`,
    pick: (values: FormValues) => CodeValues | undefined,
    legend: string,
  ) => (
    <fieldset key={prefix} className="flex flex-col gap-3 rounded-lg border p-3">
      <legend className="px-1 font-medium">{legend}</legend>
      <form.AppField name={`${prefix}.system`}>
        {() => <SelectField label={m.details_code_system()} options={systemOptions()} />}
      </form.AppField>
      <form.Subscribe selector={(state) => pick(state.values)?.system ?? ""}>
        {(system) =>
          system !== "" && (
            <>
              {system === "other" && (
                <form.AppField name={`${prefix}.uri`}>
                  {(field) => (
                    <field.TextField
                      label={m.details_system_uri()}
                      inputMode="url"
                      autoComplete="off"
                    />
                  )}
                </form.AppField>
              )}
              <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
                <form.AppField name={`${prefix}.code`}>
                  {(field) => <field.TextField label={m.details_code()} autoComplete="off" />}
                </form.AppField>
                <form.AppField name={`${prefix}.display`}>
                  {(field) => (
                    <field.TextField label={m.details_code_display()} autoComplete="off" />
                  )}
                </form.AppField>
              </div>
            </>
          )
        }
      </form.Subscribe>
    </fieldset>
  );

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
      {codeFields("element", (form) => form.element, m.details_element_code())}
      <form.AppField name="binding">
        {() => (
          <SelectField
            label={m.details_binding()}
            options={[
              { value: "", label: m.board_not_decided() },
              ...BINDING_STRENGTHS.map((strength) => ({
                value: strength,
                label: bindingLabel(strength),
              })),
            ]}
          />
        )}
      </form.AppField>
      <form.AppField name="valueSet">
        {(field) => (
          <field.TextField label={m.details_value_set()} inputMode="url" autoComplete="off" />
        )}
      </form.AppField>
      {values.map((value, index) =>
        codeFields(
          `values[${index}]`,
          (form) => form.values[index],
          m.details_value_code_legend({ value: value.text }),
        ),
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
