// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The models of the Existing models page (EL12): a card per model with its kind, title and
// element count, and the participants' suggestions with Accept and Dismiss (facilitator only).
import type { ReactNode } from "react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { SourceModelKind, SourceModelWithAuthor } from "@/server/sources/queries";

const KIND_LABELS: Record<SourceModelKind, () => string> = {
  ckm: () => m.board_models_tag_ckm(),
  fhir: () => m.board_models_tag_fhir(),
  zib: () => m.board_models_tag_zib(),
  other: () => m.board_models_tag_other(),
};

/** The identifier a model is known by in its own world. */
function modelIdentifier(model: SourceModelWithAuthor): string | null {
  if (model.ckm) return model.ckm.archetypeId;
  if (model.fhir) return `${model.fhir.package}#${model.fhir.version}`;
  return model.link;
}

export function ModelCards({
  models,
  add,
}: Readonly<{ models: readonly SourceModelWithAuthor[]; add: ReactNode }>) {
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-3">
      {models.map((model) => {
        const identifier = modelIdentifier(model);
        return (
          <li key={model.id} className="flex flex-col rounded-lg border bg-card p-4">
            <span className="mb-1.5 self-start rounded bg-muted px-1.5 text-xs font-semibold text-muted-foreground">
              {KIND_LABELS[model.kind]()}
            </span>
            <h3 className="font-semibold break-words">{model.title}</h3>
            {identifier !== null && (
              <p className="text-sm break-all text-muted-foreground">{identifier}</p>
            )}
            {model.kind !== "other" && (
              <p className="text-sm text-muted-foreground">
                {model.elementCount === 1
                  ? m.board_models_elements_one()
                  : m.board_models_elements_many({ count: model.elementCount })}
              </p>
            )}
          </li>
        );
      })}
      <li className="flex">{add}</li>
    </ul>
  );
}

function SuggestionActions({
  model,
  accept,
  dismiss,
  onDone,
}: Readonly<{
  model: SourceModelWithAuthor;
  accept: (id: string) => Promise<Outcome<unknown>>;
  dismiss: (id: string) => Promise<Outcome<unknown>>;
  onDone: () => Promise<void> | void;
}>) {
  const [pending, setPending] = useState(false);
  async function run(call: (id: string) => Promise<Outcome<unknown>>, message: string) {
    setPending(true);
    try {
      const outcome = await call(model.id);
      if (outcome.ok) {
        toast.success(message);
        await onDone();
      } else {
        toast.error(refusalMessage(outcome.error));
      }
    } catch {
      toast.error(m.common_error_unexpected());
    } finally {
      setPending(false);
    }
  }
  return (
    <span className="flex flex-wrap gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        aria-label={m.board_models_accept_named({ title: model.title })}
        onClick={() => void run(accept, m.board_models_accepted({ title: model.title }))}
      >
        {m.board_models_accept()}
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        aria-label={m.board_models_dismiss_named({ title: model.title })}
        onClick={() => void run(dismiss, m.board_models_dismissed({ title: model.title }))}
      >
        {m.board_models_dismiss()}
      </Button>
    </span>
  );
}

/** The participants' suggestions (EL12); the section is left out when there are none. */
export function Suggestions({
  suggestions,
  accept,
  dismiss,
  onDone,
}: Readonly<{
  suggestions: readonly SourceModelWithAuthor[];
  accept: (id: string) => Promise<Outcome<unknown>>;
  dismiss: (id: string) => Promise<Outcome<unknown>>;
  onDone: () => Promise<void> | void;
}>) {
  if (suggestions.length === 0) return null;
  return (
    <section aria-labelledby="suggestions-heading" className="mt-10 flex flex-col gap-3">
      <h2 id="suggestions-heading" className="text-lg font-semibold">
        {m.board_models_suggestions_title()}
      </h2>
      <ul className="border-t">
        {suggestions.map((model) => (
          <li
            key={model.id}
            className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b py-3"
          >
            <span className="flex min-w-0 flex-col">
              {model.link ? (
                <a
                  href={model.link}
                  target="_blank"
                  rel="noreferrer"
                  className="break-words underline underline-offset-4"
                >
                  {model.title}
                </a>
              ) : (
                <span className="break-words">{model.title}</span>
              )}
              {model.addedBy && (
                <span className="text-sm text-muted-foreground">
                  {m.board_models_suggested_by({
                    name: model.addedBy.name || model.addedBy.email,
                  })}
                </span>
              )}
            </span>
            <SuggestionActions model={model} accept={accept} dismiss={dismiss} onDone={onDone} />
          </li>
        ))}
      </ul>
    </section>
  );
}
