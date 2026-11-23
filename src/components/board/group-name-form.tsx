// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The name of a group of elements (EL18), for "Add a group" and "Rename"; the limits match
// `addElementGroupInput` and `renameElementGroupInput` (src/server/elements/schemas.ts).
import { revalidateLogic } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { m } from "@/i18n/messages";
import { ELEMENT_GROUP_NAME_MAX } from "@/lib/element-groups";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { refusalMessage } from "@/lib/i18n/refusals";

export function groupNameSchema() {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => m.board_grouping_name_required() })
      .max(ELEMENT_GROUP_NAME_MAX, {
        error: () => m.board_text_too_long({ max: ELEMENT_GROUP_NAME_MAX }),
      }),
  });
}

export function GroupNameForm({
  initial,
  submitLabel,
  save,
  onSaved,
  cancel,
}: Readonly<{
  initial: string;
  submitLabel: string;
  save: (name: string) => Promise<Outcome<unknown>>;
  onSaved: (name: string) => Promise<void> | void;
  cancel: ReactNode;
}>) {
  const form = useAppForm({
    defaultValues: { name: initial },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: groupNameSchema() },
    onSubmit: async ({ value, formApi }) => {
      const name = value.name.trim();
      let outcome: Outcome<unknown>;
      try {
        outcome = await save(name);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      await onSaved(name);
    },
  });
  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.AppField name="name">
        {(field) => (
          <field.TextField
            label={m.board_grouping_name_label()}
            maxLength={ELEMENT_GROUP_NAME_MAX}
            autoComplete="off"
          />
        )}
      </form.AppField>
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{submitLabel}</form.SubmitButton>
        </form.AppForm>
        {cancel}
      </div>
    </form>
  );
}
