// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The member's own marks on one element after the reveal (EL16): "I support this" as a toggle
// button and "Same as…" with a choice of the other elements. Only the member's own marks show
// here; the facilitator sees counts on the board, never who marked (EL2).
import { revalidateLogic } from "@tanstack/react-form";
import { CopyIcon, ThumbsUpIcon, XIcon } from "lucide-react";
import { useId, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { refusalMessage } from "@/lib/i18n/refusals";
import { SelectField } from "./element-fields";

/** Another element on the board, with the name the member sees. */
export interface MarkTarget {
  id: string;
  name: string;
}

/** The member's marks on one element and what they can do with them. */
export interface ElementMarkProps {
  supported: boolean;
  /** The elements the member marked as the same as this one, in either direction. */
  sameAs: readonly MarkTarget[];
  /** Every other element on the board, in board order. */
  candidates: readonly MarkTarget[];
  setSupport: (supported: boolean) => Promise<Outcome<unknown>>;
  addSameAs: (other: MarkTarget) => Promise<Outcome<unknown>>;
  removeSameAs: (other: MarkTarget) => Promise<Outcome<unknown>>;
  /** After a change: refresh the marks and confirm with `message`. */
  onChanged: (message: string) => Promise<void> | void;
}

function sameAsSchema() {
  return z.object({
    otherId: z.string().min(1, { error: () => m.board_same_as_required() }),
  });
}

export function ElementMarks({ name, marks }: Readonly<{ name: string; marks: ElementMarkProps }>) {
  const helpId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const marked = new Set(marks.sameAs.map((other) => other.id));
  const choices = marks.candidates.filter((candidate) => !marked.has(candidate.id));

  async function run(action: () => Promise<Outcome<unknown>>, message: string) {
    setBusy(true);
    setError(null);
    try {
      const outcome = await action();
      if (!outcome.ok) {
        setError(refusalMessage(outcome.error));
        return;
      }
      await marks.onChanged(message);
    } catch {
      setError(m.common_error_unexpected());
    } finally {
      setBusy(false);
    }
  }

  const form = useAppForm({
    defaultValues: { otherId: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: sameAsSchema() },
    onSubmit: async ({ value, formApi }) => {
      const other = marks.candidates.find((candidate) => candidate.id === value.otherId);
      if (!other) return;
      let outcome: Outcome<unknown>;
      try {
        outcome = await marks.addSameAs(other);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      formApi.reset();
      await marks.onChanged(m.board_same_as_added({ name, other: other.name }));
    },
  });

  return (
    <section
      aria-label={m.board_marks_label({ name })}
      aria-describedby={helpId}
      className="flex flex-col gap-3 rounded-lg border p-3"
    >
      <p id={helpId} className="text-sm text-muted-foreground">
        {m.board_marks_help()}
      </p>
      <div className="flex flex-col gap-1">
        <div>
          <Button
            type="button"
            size="sm"
            variant={marks.supported ? "default" : "outline"}
            aria-pressed={marks.supported}
            disabled={busy}
            onClick={() =>
              run(
                () => marks.setSupport(!marks.supported),
                marks.supported
                  ? m.board_support_removed({ name })
                  : m.board_support_added({ name }),
              )
            }
          >
            <ThumbsUpIcon aria-hidden="true" data-icon="inline-start" />
            {m.board_support_toggle()}
          </Button>
        </div>
        {error !== null && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      {marks.sameAs.length > 0 && (
        <div className="flex flex-col gap-1 text-sm">
          <p id={`${helpId}same`}>{m.board_same_as_yours()}</p>
          <ul aria-labelledby={`${helpId}same`} className="flex flex-col gap-1">
            {marks.sameAs.map((other) => (
              <li key={other.id} className="flex flex-wrap items-center gap-2">
                <CopyIcon aria-hidden="true" className="size-4 text-muted-foreground" />
                <span>{other.name}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() =>
                    run(
                      () => marks.removeSameAs(other),
                      m.board_same_as_removed({ name, other: other.name }),
                    )
                  }
                >
                  <XIcon aria-hidden="true" data-icon="inline-start" />
                  {m.board_same_as_remove()}
                  <span className="sr-only">: {other.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {choices.length > 0 && (
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            void form.handleSubmit();
          }}
        >
          <form.AppForm>
            <form.FormErrors />
          </form.AppForm>
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
            <form.AppField name="otherId">
              {() => (
                <SelectField
                  label={m.board_same_as_label()}
                  description={m.board_same_as_description()}
                  options={[
                    { value: "", label: m.board_same_as_placeholder() },
                    ...choices.map((choice) => ({ value: choice.id, label: choice.name })),
                  ]}
                />
              )}
            </form.AppField>
            <div className="sm:pt-6">
              <form.AppForm>
                <form.SubmitButton size="sm" variant="outline">
                  {m.board_same_as_submit()}
                </form.SubmitButton>
              </form.AppForm>
            </div>
          </div>
        </form>
      )}
    </section>
  );
}
