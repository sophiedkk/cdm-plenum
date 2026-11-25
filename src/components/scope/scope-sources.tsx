// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The ordered source documents of the scope (SC1). Every member reads them; the facilitator adds,
// moves and removes them with buttons, so the order changes without a mouse (Q-ACC-1).
import { revalidateLogic } from "@tanstack/react-form";
import { ArrowDownIcon, ArrowUpIcon, ExternalLinkIcon, Trash2Icon } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import type { ScopeSource } from "@/server/scope/queries";
import { httpUrl, SCOPE_SOURCE_LABEL_MAX, SCOPE_SOURCE_URL_MAX } from "@/server/scope/schemas";

export type SourceOutcome = { ok: true } | { ok: false; error: RefusalCode };

/** The list of sources; links open in a new tab without access to this page. */
export function ScopeSourceList({
  sources,
  editable,
  move,
  remove,
}: Readonly<{
  sources: readonly ScopeSource[];
  editable: boolean;
  /** Moves a source one place; the parent sends the new order to the server. */
  move?: (sourceId: string, direction: -1 | 1) => Promise<void>;
  remove?: (source: ScopeSource) => Promise<void>;
}>) {
  // After a move the list renders anew; focus stays on the moved source's button.
  const [focusAfterMove, setFocusAfterMove] = useState<{ id: string; direction: -1 | 1 } | null>(
    null,
  );
  const buttons = useRef(new Map<string, HTMLButtonElement | null>());
  useEffect(() => {
    if (!focusAfterMove) return;
    const index = sources.findIndex((source) => source.id === focusAfterMove.id);
    if (index === -1) return;
    const atEdge =
      (focusAfterMove.direction === -1 && index === 0) ||
      (focusAfterMove.direction === 1 && index === sources.length - 1);
    const direction = atEdge ? -focusAfterMove.direction : focusAfterMove.direction;
    buttons.current.get(`${focusAfterMove.id}:${direction}`)?.focus();
  }, [focusAfterMove, sources]);

  if (sources.length === 0) {
    return <p className="text-muted-foreground">{m.scope_sources_empty()}</p>;
  }
  return (
    <ol className="flex flex-col gap-2">
      {sources.map((source, index) => (
        <li
          key={source.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2"
        >
          <span className="flex items-center gap-2">
            <span className="text-muted-foreground">{index + 1}.</span>
            {source.url ? (
              <a
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline underline-offset-4 hover:decoration-2"
              >
                {source.label}
                <ExternalLinkIcon aria-hidden="true" className="size-3.5" />
                <span className="sr-only">{m.scope_source_new_tab()}</span>
              </a>
            ) : (
              <span>{source.label}</span>
            )}
          </span>
          {editable && move && remove && (
            <span className="flex gap-1">
              {([-1, 1] as const).map((direction) => {
                const disabled =
                  (direction === -1 && index === 0) ||
                  (direction === 1 && index === sources.length - 1);
                const label =
                  direction === -1
                    ? m.scope_source_move_up({ label: source.label })
                    : m.scope_source_move_down({ label: source.label });
                return (
                  <Button
                    key={direction}
                    ref={(node) => {
                      buttons.current.set(`${source.id}:${direction}`, node);
                    }}
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    disabled={disabled}
                    aria-label={label}
                    title={label}
                    onClick={async () => {
                      await move(source.id, direction);
                      setFocusAfterMove({ id: source.id, direction });
                    }}
                  >
                    {direction === -1 ? (
                      <ArrowUpIcon aria-hidden="true" />
                    ) : (
                      <ArrowDownIcon aria-hidden="true" />
                    )}
                  </Button>
                );
              })}
              <RemoveSourceButton source={source} remove={remove} />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

function RemoveSourceButton({
  source,
  remove,
}: Readonly<{ source: ScopeSource; remove: (source: ScopeSource) => Promise<void> }>) {
  const label = m.scope_source_remove({ label: source.label });
  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={() => void remove(source)}
    >
      <Trash2Icon aria-hidden="true" />
    </Button>
  );
}

/** The limits of `addScopeSourceInput` (src/server/scope/schemas.ts) with translated messages. */
export function scopeSourceSchema() {
  return z.object({
    label: z
      .string()
      .trim()
      .min(1, { error: () => m.scope_source_label_required() })
      .max(SCOPE_SOURCE_LABEL_MAX, {
        error: () => m.scope_text_too_long({ max: SCOPE_SOURCE_LABEL_MAX }),
      }),
    url: z
      .string()
      .trim()
      .max(SCOPE_SOURCE_URL_MAX, {
        error: () => m.scope_text_too_long({ max: SCOPE_SOURCE_URL_MAX }),
      })
      .refine((value) => value === "" || httpUrl.safeParse(value).success, {
        error: () => m.scope_source_url_invalid(),
      }),
  });
}

/** The facilitator's form to add a source at the end of the list (SC1). */
export function AddSourceForm({
  add,
  onAdded,
  close,
  cancel,
}: Readonly<{
  add: (source: { label: string; url: string | null }) => Promise<SourceOutcome>;
  onAdded: (label: string) => Promise<void> | void;
  /** Closes the dialog the form sits in; without it the form stays and takes the focus back. */
  close?: () => void;
  cancel?: ReactNode;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const form = useAppForm({
    defaultValues: { label: "", url: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: scopeSourceSchema() },
    onSubmit: async ({ value, formApi }) => {
      const label = value.label.trim();
      const url = value.url.trim() === "" ? null : value.url.trim();
      let outcome: SourceOutcome;
      try {
        outcome = await add({ label, url });
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      formApi.reset();
      if (close) {
        close();
      } else {
        // The submit button was disabled while sending, which drops focus; the field takes it back.
        formRef.current?.querySelector<HTMLElement>('input[name="label"]')?.focus();
      }
      await onAdded(label);
    },
  });

  return (
    <form
      ref={formRef}
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
      <div className="grid gap-4 sm:grid-cols-2">
        <form.AppField name="label">
          {(field) => (
            <field.TextField
              label={m.scope_source_label_label()}
              description={m.scope_source_label_description({ max: SCOPE_SOURCE_LABEL_MAX })}
              autoComplete="off"
            />
          )}
        </form.AppField>
        <form.AppField name="url">
          {(field) => (
            <field.TextField
              type="url"
              label={m.scope_source_url_label()}
              description={m.scope_source_url_description()}
              autoComplete="url"
            />
          )}
        </form.AppField>
      </div>
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton>{m.scope_source_add()}</form.SubmitButton>
        </form.AppForm>
        {cancel}
      </div>
    </form>
  );
}
