// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The three texts of the scope statement (SC1): read by every member, edited by the facilitator.
import { revalidateLogic } from "@tanstack/react-form";
import type { ReactNode } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { m } from "@/i18n/messages";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import { SCOPE_TEXT_MAX } from "@/server/scope/schemas";

export interface ScopeTexts {
  concept: string;
  useCases: string;
  outOfScope: string;
}

export type ScopeOutcome = { ok: true } | { ok: false; error: RefusalCode };

/** The parts in the order SC1 names them, each with its heading and help text. */
function parts(): { key: keyof ScopeTexts; title: string; description: string }[] {
  return [
    { key: "concept", title: m.scope_concept(), description: m.scope_concept_description() },
    { key: "useCases", title: m.scope_use_cases(), description: m.scope_use_cases_description() },
    {
      key: "outOfScope",
      title: m.scope_out_of_scope(),
      description: m.scope_out_of_scope_description(),
    },
  ];
}

/** The scope statement as every member reads it. */
export function ScopeStatementView({ texts }: Readonly<{ texts: ScopeTexts }>) {
  return (
    <div className="flex flex-col gap-4">
      {parts().map((part) => (
        <section key={part.key} aria-labelledby={`scope-${part.key}`}>
          <h4 id={`scope-${part.key}`} className="font-medium">
            {part.title}
          </h4>
          {texts[part.key] === "" ? (
            <p className="text-muted-foreground">{m.scope_not_written()}</p>
          ) : (
            <p className="whitespace-pre-wrap">{texts[part.key]}</p>
          )}
        </section>
      ))}
    </div>
  );
}

/** The limits of `updateScopeInput` (src/server/scope/schemas.ts) with translated messages. */
export function scopeStatementSchema() {
  const text = z
    .string()
    .max(SCOPE_TEXT_MAX, { error: () => m.scope_text_too_long({ max: SCOPE_TEXT_MAX }) });
  return z.object({ concept: text, useCases: text, outOfScope: text });
}

/** The facilitator's form for the three texts (SC1). */
export function ScopeStatementForm({
  texts,
  save,
  onSaved,
  actions,
}: Readonly<{
  texts: ScopeTexts;
  save: (texts: ScopeTexts) => Promise<ScopeOutcome>;
  onSaved: () => Promise<void> | void;
  actions?: ReactNode;
}>) {
  const form = useAppForm({
    defaultValues: texts,
    validationLogic: revalidateLogic(),
    validators: { onDynamic: scopeStatementSchema() },
    onSubmit: async ({ value, formApi }) => {
      let outcome: ScopeOutcome;
      try {
        outcome = await save({
          concept: value.concept.trim(),
          useCases: value.useCases.trim(),
          outOfScope: value.outOfScope.trim(),
        });
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

  return (
    <form
      noValidate
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      {parts().map((part) => (
        <form.AppField key={part.key} name={part.key}>
          {(field) => (
            <field.TextareaField label={part.title} description={part.description} rows={4} />
          )}
        </form.AppField>
      ))}
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{m.scope_save()}</form.SubmitButton>
        </form.AppForm>
        {actions}
      </div>
    </form>
  );
}
