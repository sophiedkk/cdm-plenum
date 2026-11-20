// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Merging duplicate elements (EL5): the element that stays and the duplicates that go into it.
import { revalidateLogic } from "@tanstack/react-form";
import { type ReactNode, useId } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { FieldFeedback, useFieldA11y } from "@/components/form/field-a11y";
import { useFieldContext } from "@/components/form/form-context";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { m } from "@/i18n/messages";
import { MERGE_SOURCES_MAX } from "@/lib/elements";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import { SelectField } from "./element-fields";

export interface MergeCandidate {
  id: string;
  name: string;
}

export type MergeOutcome = { ok: true } | { ok: false; error: RefusalCode };

/** The checks of `mergeElementsInput` (src/server/elements/schemas.ts) with translated messages. */
export function mergeSchema() {
  return z.object({
    intoId: z.string().min(1, { error: () => m.board_merge_into_required() }),
    fromIds: z
      .array(z.string())
      .min(1, { error: () => m.board_merge_from_required() })
      .max(MERGE_SOURCES_MAX, {
        error: () => m.board_merge_from_too_many({ max: MERGE_SOURCES_MAX }),
      }),
  });
}

/** Checkboxes for the duplicates; the element that stays is not among them. */
function DuplicatesField({
  candidates,
  intoId,
}: Readonly<{ candidates: readonly MergeCandidate[]; intoId: string }>) {
  const field = useFieldContext<string[]>();
  const a11y = useFieldA11y(field, undefined);
  const base = useId();
  const selected = new Set(field.state.value);
  return (
    <FieldSet
      data-invalid={a11y.isInvalid}
      aria-describedby={a11y.controlProps["aria-describedby"]}
    >
      <FieldLegend>{m.board_merge_from_legend()}</FieldLegend>
      <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto rounded-lg border p-1">
        {candidates
          .filter((candidate) => candidate.id !== intoId)
          .map((candidate, index) => {
            const id = `${base}${candidate.id}`;
            return (
              <li key={candidate.id}>
                <label
                  htmlFor={id}
                  className="flex cursor-pointer gap-2 rounded-md p-2 hover:bg-muted"
                >
                  <input
                    id={id}
                    type="checkbox"
                    // The first box carries the field's invalid state, so focus lands there.
                    aria-invalid={index === 0 ? a11y.isInvalid : undefined}
                    checked={selected.has(candidate.id)}
                    onBlur={field.handleBlur}
                    onChange={(event) =>
                      field.handleChange(
                        event.target.checked
                          ? [...field.state.value, candidate.id]
                          : field.state.value.filter((value) => value !== candidate.id),
                      )
                    }
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                  />
                  <span>{candidate.name}</span>
                </label>
              </li>
            );
          })}
      </ul>
      <FieldFeedback a11y={a11y} description={undefined} />
    </FieldSet>
  );
}

export function MergeForm({
  candidates,
  merge,
  onMerged,
  actions,
  initial,
}: Readonly<{
  candidates: readonly MergeCandidate[];
  merge: (intoId: string, fromIds: string[]) => Promise<MergeOutcome>;
  onMerged: (into: MergeCandidate) => Promise<void> | void;
  actions?: ReactNode;
  /** The choice to start from, such as a pair of possible duplicates (EL16). */
  initial?: { intoId: string; fromIds: string[] } | undefined;
}>) {
  const form = useAppForm({
    defaultValues: initial ?? { intoId: "", fromIds: [] as string[] },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: mergeSchema() },
    onSubmit: async ({ value, formApi }) => {
      const fromIds = value.fromIds.filter((id) => id !== value.intoId);
      let outcome: MergeOutcome;
      try {
        outcome = await merge(value.intoId, fromIds);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      const into = candidates.find((candidate) => candidate.id === value.intoId);
      if (into) await onMerged(into);
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
      <form.AppField
        name="intoId"
        listeners={{
          // The element that stays cannot also be a duplicate.
          onChange: ({ value }) =>
            form.setFieldValue(
              "fromIds",
              form.getFieldValue("fromIds").filter((id) => id !== value),
            ),
        }}
      >
        {() => (
          <SelectField
            label={m.board_merge_into_label()}
            description={m.board_merge_into_description()}
            options={[
              { value: "", label: m.board_merge_into_placeholder() },
              ...candidates.map((candidate) => ({ value: candidate.id, label: candidate.name })),
            ]}
          />
        )}
      </form.AppField>
      <form.Subscribe selector={(state) => state.values.intoId}>
        {(intoId) => (
          <form.AppField name="fromIds">
            {() => <DuplicatesField candidates={candidates} intoId={intoId} />}
          </form.AppField>
        )}
      </form.Subscribe>
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{m.board_merge_submit()}</form.SubmitButton>
        </form.AppForm>
        {actions}
      </div>
    </form>
  );
}
