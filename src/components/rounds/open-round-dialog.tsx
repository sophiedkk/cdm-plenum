// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Opening a draft round (DE2, DE12): a confirmation that the setup is fixed from then on, and
// when the server answers `reason_required`, the shortfall and a reason for opening anyway.
import { revalidateLogic } from "@tanstack/react-form";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { m } from "@/i18n/messages";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import type { Shortfall } from "@/lib/panel";
import { BELOW_MINIMUM_REASON_MAX } from "@/server/rounds/schemas";
import { shortfallText } from "./panel-setup";

/** What the open call answers. */
export type OpenRoundOutcome =
  | { ok: true; value: { status: "complete" | "below_minimum" } }
  | { ok: false; error: "reason_required"; shortfall: Shortfall[] }
  | { ok: false; error: RefusalCode };

function reasonSchema() {
  return z.object({
    reason: z
      .string()
      .trim()
      .min(1, { error: () => m.rounds_open_reason_required() })
      .max(BELOW_MINIMUM_REASON_MAX, {
        error: () => m.rounds_open_reason_too_long({ max: BELOW_MINIMUM_REASON_MAX }),
      }),
  });
}

function ReasonForm({
  shortfall,
  open,
  onOpened,
}: Readonly<{
  shortfall: Shortfall[];
  open: (reason: string) => Promise<OpenRoundOutcome>;
  onOpened: (status: "complete" | "below_minimum") => Promise<void> | void;
}>) {
  const form = useAppForm({
    defaultValues: { reason: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: reasonSchema() },
    onSubmit: async ({ value, formApi }) => {
      let outcome: OpenRoundOutcome;
      try {
        outcome = await open(value.reason.trim());
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      await onOpened(outcome.value.status);
    },
  });
  const ref = useRef<HTMLFormElement>(null);
  // The confirm button this form replaces had the focus; it moves to the reason.
  useEffect(() => {
    ref.current?.querySelector("textarea")?.focus();
  }, []);
  return (
    <form
      ref={ref}
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
      <Alert>
        <AlertDescription>
          <p>{m.rounds_open_below_minimum()}</p>
          <ul className="mt-2 list-disc pl-5">
            {shortfallText(shortfall).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </AlertDescription>
      </Alert>
      <form.AppField name="reason">
        {(field) => (
          <field.TextareaField
            label={m.rounds_open_reason_label()}
            description={m.rounds_open_reason_help({ max: BELOW_MINIMUM_REASON_MAX })}
            rows={3}
          />
        )}
      </form.AppField>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="outline">
            {m.common_cancel()}
          </Button>
        </DialogClose>
        <form.AppForm>
          <form.SubmitButton>{m.rounds_open_with_reason()}</form.SubmitButton>
        </form.AppForm>
      </DialogFooter>
    </form>
  );
}

/** The "open round" button with its dialog. */
export function OpenRoundDialog({
  number,
  open,
  onOpened,
}: Readonly<{
  number: number;
  open: (reason?: string) => Promise<OpenRoundOutcome>;
  onOpened: (status: "complete" | "below_minimum") => Promise<void> | void;
}>) {
  const [isOpen, setOpen] = useState(false);
  const [shortfall, setShortfall] = useState<Shortfall[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setShortfall(null);
      setError(null);
    }
  };
  const finish = async (status: "complete" | "below_minimum") => {
    reset(false);
    await onOpened(status);
  };
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const outcome = await open();
      if (outcome.ok) {
        await finish(outcome.value.status);
      } else if (outcome.error === "reason_required" && "shortfall" in outcome) {
        setShortfall(outcome.shortfall);
      } else {
        setError(refusalMessage(outcome.error));
      }
    } catch {
      setError(m.common_error_unexpected());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button type="button">{m.rounds_open_button()}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{m.rounds_open_title({ number })}</DialogTitle>
          <DialogDescription>{m.rounds_open_fixed()}</DialogDescription>
        </DialogHeader>
        {shortfall === null ? (
          <>
            {error && (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="outline">
                  {m.common_cancel()}
                </Button>
              </DialogClose>
              <Button type="button" disabled={busy} aria-busy={busy} onClick={() => void confirm()}>
                {m.rounds_open_confirm()}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <ReasonForm shortfall={shortfall} open={(reason) => open(reason)} onOpened={finish} />
        )}
      </DialogContent>
    </Dialog>
  );
}
