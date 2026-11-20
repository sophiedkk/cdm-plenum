// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One brainstorm question with its quick-add form (EL14, EL15): a name and an optional line,
// Enter adds. After the reveal the form lists elements with a similar name while the participant
// types; before it, `hintSource` is null and the form shows none, so nothing of others leaks.
// "Same as this" next to a hint supports that element instead of adding the typed one (EL16).
import { revalidateLogic, useStore } from "@tanstack/react-form";
import { CopyIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useId, useRef } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { similarElements } from "@/lib/brainstorm";
import { ELEMENT_DESCRIPTION_MAX, ELEMENT_NAME_MAX } from "@/lib/elements";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { refusalMessage } from "@/lib/i18n/refusals";

export interface HintElement {
  id: string;
  name: string;
}

/** The limits of `addElementInput` (src/server/elements/schemas.ts), with translated messages. */
export function quickAddSchema() {
  return z.object({
    name: z
      .string()
      .trim()
      .min(1, { error: () => m.board_name_required() })
      .max(ELEMENT_NAME_MAX, { error: () => m.board_text_too_long({ max: ELEMENT_NAME_MAX }) }),
    description: z.string().max(ELEMENT_DESCRIPTION_MAX, {
      error: () => m.board_text_too_long({ max: ELEMENT_DESCRIPTION_MAX }),
    }),
  });
}

export function QuickAddForm({
  question,
  hintSource,
  hintLink,
  submit,
  onAdded,
  markSame,
  onMarkedSame,
  children,
}: Readonly<{
  question: string;
  /** The board's elements to compare names with; null before the reveal (EL13). */
  hintSource: readonly HintElement[] | null;
  /** A link that opens a hinted element on the board. */
  hintLink: (element: HintElement) => ReactNode;
  submit: (fields: { name: string; description: string }) => Promise<Outcome<unknown>>;
  onAdded: (name: string) => Promise<void> | void;
  /** Supports a hinted element; left out when marks are closed (EL16). */
  markSame?: ((element: HintElement) => Promise<Outcome<unknown>>) | undefined;
  onMarkedSame?: (element: HintElement) => Promise<void> | void;
  /** The participant's own elements for this question, under the form. */
  children?: ReactNode;
}>) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const form = useAppForm({
    defaultValues: { name: "", description: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: quickAddSchema() },
    onSubmit: async ({ value, formApi }) => {
      const fields = { name: value.name.trim(), description: value.description.trim() };
      try {
        const outcome = await submit(fields);
        if (!outcome.ok) {
          applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
          return;
        }
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      formApi.reset();
      await onAdded(fields.name);
      // Ready for the next idea: the cursor goes back to the name.
      formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    },
  });
  const typed = useStore(form.store, (state) => state.values.name);
  const hints = hintSource === null ? [] : similarElements(typed, hintSource);

  async function sameAs(element: HintElement) {
    if (!markSame) return;
    try {
      const outcome = await markSame(element);
      if (!outcome.ok) {
        applyServerRefusal(form, { form: refusalMessage(outcome.error) });
        return;
      }
    } catch {
      applyServerRefusal(form, { form: m.common_error_unexpected() });
      return;
    }
    // The typed element is not added: the participant chose the one on the board.
    form.reset();
    await onMarkedSame?.(element);
    formRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }

  return (
    <section aria-labelledby={`${id}question`} className="flex flex-col gap-3 border-b pb-6">
      <h3 id={`${id}question`} className="text-lg font-semibold">
        {question}
      </h3>
      <form
        ref={formRef}
        noValidate
        aria-labelledby={`${id}question`}
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppForm>
          <form.FormErrors />
        </form.AppForm>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-start">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label={m.board_quick_name_label()}
                maxLength={ELEMENT_NAME_MAX}
                autoComplete="off"
              />
            )}
          </form.AppField>
          <form.AppField name="description">
            {(field) => (
              <field.TextField
                label={m.board_quick_description_label()}
                maxLength={ELEMENT_DESCRIPTION_MAX}
                autoComplete="off"
              />
            )}
          </form.AppField>
          <div className="md:pt-6">
            <form.AppForm>
              <form.SubmitButton icon={<PlusIcon aria-hidden="true" data-icon="inline-start" />}>
                {m.board_quick_add()}
              </form.SubmitButton>
            </form.AppForm>
          </div>
        </div>
        {/* A polite live region: the count is read once the participant pauses typing. */}
        <div role="status" className="text-sm">
          {hints.length > 0 && (
            <div className="flex flex-col gap-1">
              <p className="font-medium">{m.board_hints_title({ count: hints.length })}</p>
              <p className="text-muted-foreground">
                {markSame ? m.board_hints_help_same() : m.board_hints_help()}
              </p>
            </div>
          )}
        </div>
        {hints.length > 0 && (
          <ul aria-label={m.board_hints_list_label()} className="flex flex-col gap-1 text-sm">
            {hints.map((element) => (
              <li key={element.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                {hintLink(element)}
                {markSame && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void sameAs(element)}
                  >
                    <CopyIcon aria-hidden="true" data-icon="inline-start" />
                    {m.board_hints_same()}
                    <span className="sr-only">: {element.name}</span>
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </form>
      {children}
    </section>
  );
}
