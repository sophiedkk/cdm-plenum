// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The model type of the project (SC4, ADR 0021): every member reads it; the facilitator chooses
// it from the five types, each with a one-line explanation, until discover ends.
import { useAppForm } from "@/components/form/app-form";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { m } from "@/i18n/messages";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { modelTypeDescription, modelTypeLabel } from "@/lib/i18n/labels";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import { isModelType, MODEL_TYPES, type ModelType } from "@/lib/model-types";

export type ModelTypeOutcome = { ok: true } | { ok: false; error: RefusalCode };

/** The chosen type with its explanation, or a line that none is chosen yet. */
export function ModelTypeView({ type }: Readonly<{ type: ModelType | null }>) {
  if (type === null) return <p className="text-muted-foreground">{m.scope_model_type_none()}</p>;
  return (
    <div>
      <p className="font-semibold">{modelTypeLabel(type)}</p>
      <p className="text-muted-foreground">{modelTypeDescription(type)}</p>
    </div>
  );
}

/** The facilitator's choice of the model type, saved with one button. */
export function ModelTypeForm({
  type,
  save,
  onSaved,
}: Readonly<{
  type: ModelType | null;
  save: (type: ModelType) => Promise<ModelTypeOutcome>;
  onSaved: () => Promise<void> | void;
}>) {
  const form = useAppForm({
    defaultValues: { modelType: (type ?? "") as ModelType | "" },
    validators: {
      onSubmit: ({ value }) =>
        isModelType(value.modelType) ? undefined : m.scope_model_type_required(),
    },
    onSubmit: async ({ value, formApi }) => {
      if (!isModelType(value.modelType)) return;
      let outcome: ModelTypeOutcome;
      try {
        outcome = await save(value.modelType);
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
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.Field name="modelType">
        {(field) => (
          <FieldSet>
            <FieldLegend className="sr-only">{m.scope_model_type_heading()}</FieldLegend>
            <RadioGroup
              name={field.name}
              value={field.state.value}
              onValueChange={(value) => field.handleChange(isModelType(value) ? value : "")}
            >
              {MODEL_TYPES.map((option) => {
                const id = `model-type-${option}`;
                return (
                  <Field key={option} orientation="horizontal">
                    <RadioGroupItem value={option} id={id} aria-describedby={`${id}-description`} />
                    <FieldContent>
                      <FieldLabel htmlFor={id}>{modelTypeLabel(option)}</FieldLabel>
                      <FieldDescription id={`${id}-description`}>
                        {modelTypeDescription(option)}
                      </FieldDescription>
                    </FieldContent>
                  </Field>
                );
              })}
            </RadioGroup>
          </FieldSet>
        )}
      </form.Field>
      <div>
        <form.AppForm>
          <form.SubmitButton variant="outline">{m.scope_model_type_save()}</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}
