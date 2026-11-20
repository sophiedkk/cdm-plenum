// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The details of an element on a rating card (DE1, DE17): data type, cardinality and values,
// folded away and marked "not rated", because the rating covers inclusion only. Next to each
// detail the participant flags it as wrong with a required reason, and changes or removes the
// flag while the round is open. `DetailFlagList` is the facilitator's compact list of the flags
// on the round page, with names only when the round shows the raters (DE4).
import { revalidateLogic } from "@tanstack/react-form";
import { FlagIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import type { ElementFlags, OwnFlag } from "@/server/rounds/flags";
import {
  DETAIL_FLAG_KINDS,
  DETAIL_FLAG_REASON_MAX,
  type DetailFlagKind,
} from "@/server/rounds/schemas";

export type FlagOutcome = { ok: true } | { ok: false; error: RefusalCode };

/** The details of an element as the card shows them; null where nothing is chosen yet. */
export interface ElementDetails {
  dataType: string | null;
  cardinality: string | null;
  values: string[];
}

/** The capitalised name of a detail, for a label. */
export function detailLabel(kind: DetailFlagKind): string {
  if (kind === "data_type") return m.rounds_card_data_type();
  if (kind === "cardinality") return m.rounds_card_cardinality();
  return m.rounds_card_values();
}

/** The lower-case name of a detail, inside a sentence. */
function detailWord(kind: DetailFlagKind): string {
  if (kind === "data_type") return m.rounds_flag_detail_data_type();
  if (kind === "cardinality") return m.rounds_flag_detail_cardinality();
  return m.rounds_flag_detail_values();
}

function reasonLabel(kind: DetailFlagKind): string {
  if (kind === "data_type") return m.rounds_flag_reason_data_type();
  if (kind === "cardinality") return m.rounds_flag_reason_cardinality();
  return m.rounds_flag_reason_values();
}

function detailValue(kind: DetailFlagKind, details: ElementDetails): string {
  if (kind === "data_type") return details.dataType ?? m.rounds_card_not_decided();
  if (kind === "cardinality") return details.cardinality ?? m.rounds_card_not_decided();
  return details.values.length === 0 ? m.rounds_card_no_values() : details.values.join(", ");
}

/**
 * The limits of `saveDetailFlagInput` (src/server/rounds/schemas.ts) with translated messages.
 * Call it during render, so the messages follow the active locale.
 */
export function flagSchema() {
  return z.object({
    reason: z
      .string()
      .trim()
      .min(1, { error: () => m.rounds_flag_reason_required() })
      .max(DETAIL_FLAG_REASON_MAX, {
        error: () => m.rounds_flag_reason_too_long({ max: DETAIL_FLAG_REASON_MAX }),
      }),
  });
}

function FlagForm({
  kind,
  initial,
  save,
  onDone,
}: Readonly<{
  kind: DetailFlagKind;
  initial: string;
  save: (reason: string) => Promise<FlagOutcome>;
  onDone: (saved: boolean) => void;
}>) {
  const formRef = useRef<HTMLFormElement>(null);
  const form = useAppForm({
    defaultValues: { reason: initial },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: flagSchema() },
    onSubmit: async ({ value, formApi }) => {
      let outcome: FlagOutcome;
      try {
        outcome = await save(value.reason.trim());
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      onDone(true);
    },
  });
  useEffect(() => {
    formRef.current?.querySelector<HTMLElement>("textarea")?.focus();
  }, []);
  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <form.AppField name="reason">
        {(field) => (
          <field.TextareaField
            label={reasonLabel(kind)}
            description={m.rounds_flag_reason_help({ max: DETAIL_FLAG_REASON_MAX })}
            rows={2}
            maxLength={DETAIL_FLAG_REASON_MAX}
          />
        )}
      </form.AppField>
      <div className="flex flex-wrap gap-2">
        <form.AppForm>
          <form.SubmitButton size="sm">{m.rounds_flag_save()}</form.SubmitButton>
        </form.AppForm>
        <Button type="button" variant="outline" size="sm" onClick={() => onDone(false)}>
          {m.common_cancel()}
        </Button>
      </div>
    </form>
  );
}

type FlagStatus = { text: string; error: boolean } | null;

/** One detail with its value and the participant's flag on it. */
function DetailRow({
  kind,
  details,
  flag,
  editable,
  save,
  remove,
  setStatus,
}: Readonly<{
  kind: DetailFlagKind;
  details: ElementDetails;
  flag: OwnFlag | undefined;
  editable: boolean;
  save: (reason: string) => Promise<FlagOutcome>;
  remove: () => Promise<FlagOutcome>;
  /** Says what happened in the one status line of the details. */
  setStatus: (status: FlagStatus) => void;
}>) {
  const [editing, setEditing] = useState(false);
  const action = useRef<HTMLButtonElement>(null);
  // Set when the form closes or a flag goes, so focus lands on the button that replaces it.
  const refocus = useRef(false);
  const word = detailWord(kind);

  useEffect(() => {
    if (!editing && refocus.current) {
      refocus.current = false;
      action.current?.focus();
    }
  });

  const removeFlag = async () => {
    setStatus(null);
    try {
      const outcome = await remove();
      if (outcome.ok) {
        refocus.current = true;
        setStatus({ text: m.rounds_flag_removed(), error: false });
      } else {
        setStatus({ text: refusalMessage(outcome.error), error: true });
      }
    } catch {
      setStatus({ text: m.common_error_unexpected(), error: true });
    }
  };

  return (
    <>
      <dt className="font-medium">{detailLabel(kind)}</dt>
      <dd className="flex min-w-0 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
          <span className="break-words">{detailValue(kind, details)}</span>
          {editable && !editing && (
            <div className="flex flex-wrap gap-2">
              <Button
                ref={action}
                type="button"
                variant="outline"
                size="sm"
                aria-label={
                  flag
                    ? m.rounds_flag_change_named({ detail: word })
                    : m.rounds_flag_open_named({ detail: word })
                }
                onClick={() => {
                  setStatus(null);
                  setEditing(true);
                }}
              >
                {!flag && <FlagIcon aria-hidden="true" data-icon="inline-start" />}
                {flag ? m.rounds_flag_change() : m.rounds_flag_open()}
              </Button>
              {flag && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label={m.rounds_flag_remove_named({ detail: word })}
                  onClick={() => void removeFlag()}
                >
                  {m.rounds_flag_remove()}
                </Button>
              )}
            </div>
          )}
        </div>
        {flag && !editing && (
          <p className="flex items-start gap-1.5 text-sm">
            <FlagIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-warning" />
            <span className="break-words">{m.rounds_flag_yours({ reason: flag.reason })}</span>
          </p>
        )}
        {editing && (
          <FlagForm
            kind={kind}
            initial={flag?.reason ?? ""}
            save={save}
            onDone={(saved) => {
              refocus.current = true;
              setStatus(saved ? { text: m.rounds_flag_saved(), error: false } : null);
              setEditing(false);
            }}
          />
        )}
      </dd>
    </>
  );
}

/**
 * The folded details of an element on its rating card, marked "not rated", with a flag per
 * detail (DE17).
 */
export function ElementDetailsDisclosure({
  details,
  flags,
  editable,
  saveFlag,
  removeFlag,
}: Readonly<{
  details: ElementDetails;
  flags: readonly OwnFlag[];
  editable: boolean;
  saveFlag: (kind: DetailFlagKind, reason: string) => Promise<FlagOutcome>;
  removeFlag: (kind: DetailFlagKind) => Promise<FlagOutcome>;
}>) {
  const [status, setStatus] = useState<FlagStatus>(null);
  return (
    <details className="rounded-md border px-3 py-2 text-sm">
      <summary className="cursor-pointer font-medium">
        {flags.length === 0
          ? m.rounds_card_details_summary()
          : m.rounds_card_details_summary_flagged({ count: flags.length })}
      </summary>
      <div className="mt-2 flex flex-col gap-3">
        <p className="text-muted-foreground">{m.rounds_card_details_intro()}</p>
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-[auto_1fr]">
          {DETAIL_FLAG_KINDS.map((kind) => (
            <DetailRow
              key={kind}
              kind={kind}
              details={details}
              flag={flags.find((flag) => flag.kind === kind)}
              editable={editable}
              save={(reason) => saveFlag(kind, reason)}
              remove={() => removeFlag(kind)}
              setStatus={setStatus}
            />
          ))}
        </dl>
        <p
          role="status"
          className={status?.error ? "text-sm text-destructive" : "text-sm text-muted-foreground"}
        >
          {status?.text ?? ""}
        </p>
      </div>
    </details>
  );
}

/**
 * The facilitator's list of the detail flags of a round, per element, with the count per detail
 * and every reason (DE17). `flaggers` names who set which flag, and is given only when the round
 * lets the facilitator see the raters (DE4).
 */
export function DetailFlagList({
  elements,
  flags,
  flaggers,
}: Readonly<{
  /** The round's elements, in round order, for the names. */
  elements: readonly { id: string; name: string }[];
  flags: readonly ElementFlags[];
  flaggers?: ReadonlyMap<string, string> | undefined;
}>) {
  const headingId = useId();
  const byElement = new Map(flags.map((element) => [element.elementId, element]));
  const flagged = elements.filter((element) => byElement.has(element.id));
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 id={headingId} className="text-lg font-semibold">
          {m.rounds_flags_heading({ count: flagged.length })}
        </h3>
        <p className="text-sm text-muted-foreground">{m.rounds_flags_intro()}</p>
      </div>
      {flagged.length === 0 ? (
        <p className="text-sm text-muted-foreground">{m.rounds_flags_none()}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-md border">
          {flagged.map((element) => {
            const entry = byElement.get(element.id);
            if (!entry) return null;
            return (
              <li key={element.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="font-medium break-words">{element.name}</span>
                  {DETAIL_FLAG_KINDS.filter((kind) => entry.counts[kind] > 0).map((kind) => (
                    <span key={kind} className="text-muted-foreground">
                      {m.rounds_flags_count({
                        detail: detailLabel(kind),
                        count: entry.counts[kind],
                      })}
                    </span>
                  ))}
                </p>
                <ul className="flex list-disc flex-col gap-0.5 pl-5">
                  {entry.flags.map((flag) => {
                    const name = flaggers?.get(flag.id);
                    return (
                      <li key={flag.id} className="break-words">
                        {name === undefined
                          ? m.rounds_flags_reason({
                              detail: detailLabel(flag.kind),
                              reason: flag.reason,
                            })
                          : m.rounds_flags_reason_by({
                              detail: detailLabel(flag.kind),
                              reason: flag.reason,
                              name,
                            })}
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
