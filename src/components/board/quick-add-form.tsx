// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The brainstorm's one quick-add form (EL14, EL15, ADR 0018): a choice of the four questions, a
// name and an optional line; Enter adds and the question stays chosen. After the reveal the form
// lists elements with a similar name while the participant types; before it, `hintSource` is null
// and the form shows none, so nothing of others leaks. "Same as this" next to a hint supports that
// element instead of adding the typed one (EL16).
import { revalidateLogic, useStore } from "@tanstack/react-form";
import { CopyIcon, PlusIcon } from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import {
  ELEMENT_PROMPTS,
  type ElementPrompt,
  isElementPrompt,
  similarElements,
} from "@/lib/brainstorm";
import { ELEMENT_DESCRIPTION_MAX, ELEMENT_NAME_MAX } from "@/lib/elements";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { promptLabel, promptQuestion } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import { cn } from "@/lib/utils";

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

/** The name field, the first text field of the form; the question choices come before it. */
const NAME_INPUT = "input:not([type=radio])";

/** The fields the form sends: `addElementInput` without the project. */
export interface QuickAddFields {
  name: string;
  description: string;
  prompt: ElementPrompt;
}

/**
 * The four questions as one row of choices, each with its short name; the full question shows
 * under the row and describes the name field.
 */
function PromptChoice({
  value,
  onChange,
}: Readonly<{ value: ElementPrompt; onChange: (prompt: ElementPrompt) => void }>) {
  const id = useId();
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium">{m.board_quick_question_label()}</legend>
      <div className="flex flex-wrap gap-1 rounded-lg border p-1">
        {ELEMENT_PROMPTS.map((prompt) => (
          <label
            key={prompt}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1 text-sm has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
              prompt === value
                ? "bg-primary font-medium text-primary-foreground"
                : "hover:bg-accent hover:text-accent-foreground",
            )}
          >
            <input
              type="radio"
              name={`${id}prompt`}
              value={prompt}
              checked={prompt === value}
              onChange={(event) => {
                if (isElementPrompt(event.target.value)) onChange(event.target.value);
              }}
              className="sr-only"
            />
            {promptLabel(prompt)}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function QuickAddForm({
  label,
  hintSource,
  hintLink,
  submit,
  onAdded,
  markSame,
  onMarkedSame,
  children,
}: Readonly<{
  /** The name of the form and its heading. */
  label: string;
  /** The board's elements to compare names with; null before the reveal (EL13). */
  hintSource: readonly HintElement[] | null;
  /** A link that opens a hinted element on the board. */
  hintLink: (element: HintElement) => ReactNode;
  submit: (fields: QuickAddFields) => Promise<Outcome<unknown>>;
  onAdded: (name: string) => Promise<void> | void;
  /** Supports a hinted element; left out when marks are closed (EL16). */
  markSame?: ((element: HintElement) => Promise<Outcome<unknown>>) | undefined;
  onMarkedSame?: (element: HintElement) => Promise<void> | void;
  /** What shows under the form, such as the participant's own elements. */
  children?: ReactNode;
}>) {
  const id = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const [prompt, setPrompt] = useState<ElementPrompt>(ELEMENT_PROMPTS[0]);
  const form = useAppForm({
    defaultValues: { name: "", description: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: quickAddSchema() },
    onSubmit: async ({ value, formApi }) => {
      const fields = { name: value.name.trim(), description: value.description.trim(), prompt };
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
      formRef.current?.querySelector<HTMLInputElement>(NAME_INPUT)?.focus();
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
    formRef.current?.querySelector<HTMLInputElement>(NAME_INPUT)?.focus();
  }

  return (
    <section aria-labelledby={`${id}title`} className="flex flex-col gap-3">
      <h3 id={`${id}title`} className="text-lg font-semibold">
        {label}
      </h3>
      <form
        ref={formRef}
        noValidate
        aria-labelledby={`${id}title`}
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void form.handleSubmit();
        }}
      >
        <form.AppForm>
          <form.FormErrors />
        </form.AppForm>
        <PromptChoice value={prompt} onChange={setPrompt} />
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_auto] md:items-start">
          <form.AppField name="name">
            {(field) => (
              <field.TextField
                label={m.board_quick_name_label()}
                description={promptQuestion(prompt)}
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
