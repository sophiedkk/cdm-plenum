// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The panel of a project next to its minimum (DE11), the change class and the project's own
// minimum per expert type with its reason (DE13). Both are fixed once a round has opened
// (`panel_locked`).
import { revalidateLogic } from "@tanstack/react-form";
import { CircleAlertIcon, CircleCheckIcon, LockIcon } from "lucide-react";
import { useId, useState } from "react";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { SaveStatus, useAutoSave } from "@/components/settings/auto-save";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@/components/ui/field";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { m } from "@/i18n/messages";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { type RefusalCode, refusalMessage } from "@/lib/i18n/refusals";
import { changeClassDescription, changeClassLabel, expertTypeLabel } from "@/lib/i18n/round-labels";
import { CHANGE_CLASSES, type ChangeClass, EXPERT_TYPES, type ExpertType } from "@/lib/panel";
import type { PanelStatus } from "@/server/rounds/queries";
import { PANEL_MINIMUM_REASON_MAX } from "@/server/rounds/schemas";

/** What a panel action answers: done, or refused with a code. */
export type PanelOutcome = { ok: true } | { ok: false; error: RefusalCode };

/** The project's own count per expert type; null keeps the class default (DE13). */
export type PanelMinimums = Record<ExpertType, number | null>;

/** The joined participants per expert type next to the minimum, with any shortfall in words. */
export function PanelTable({
  joined,
  minimum,
  caption,
}: Readonly<{
  joined: Record<ExpertType, number>;
  minimum: Record<ExpertType, number>;
  caption: string;
}>) {
  return (
    <Table aria-label={caption}>
      <TableCaption className="sr-only">{caption}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.rounds_panel_column_type()}</TableHead>
          <TableHead scope="col">{m.rounds_panel_column_joined()}</TableHead>
          <TableHead scope="col">{m.rounds_panel_column_minimum()}</TableHead>
          <TableHead scope="col">{m.rounds_panel_column_status()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {EXPERT_TYPES.map((type) => {
          const short = minimum[type] - joined[type];
          return (
            <TableRow key={type}>
              <TableHead scope="row" className="font-normal">
                {expertTypeLabel(type)}
              </TableHead>
              <TableCell>{joined[type]}</TableCell>
              <TableCell>{minimum[type]}</TableCell>
              <TableCell>
                {short > 0 ? (
                  <StatusBadge
                    tone="warning"
                    icon={CircleAlertIcon}
                    label={m.rounds_panel_short({ count: short })}
                  />
                ) : (
                  <StatusBadge
                    tone="success"
                    icon={CircleCheckIcon}
                    label={m.rounds_panel_complete()}
                  />
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** A sentence per expert type below the minimum, or one sentence that the panel is complete. */
export function shortfallText(shortfall: PanelStatus["shortfall"]): string[] {
  if (shortfall.length === 0) return [m.rounds_panel_meets_minimum()];
  return shortfall.map((item) =>
    m.rounds_panel_shortfall_line({
      type: expertTypeLabel(item.expertType),
      joined: item.joined,
      minimum: item.minimum,
    }),
  );
}

function ChangeClassForm({
  current,
  save,
}: Readonly<{
  current: ChangeClass;
  save: (changeClass: ChangeClass) => Promise<PanelOutcome>;
}>) {
  const [value, setValue] = useState(current);
  const { state, run } = useAutoSave();

  async function change(next: ChangeClass) {
    const before = value;
    setValue(next);
    if (!(await run(() => save(next)))) setValue(before);
  }

  return (
    <FieldSet>
      <FieldLegend>{m.rounds_change_class_legend()}</FieldLegend>
      <FieldDescription>{m.rounds_change_class_help()}</FieldDescription>
      <RadioGroup value={value} onValueChange={(next) => void change(next as ChangeClass)}>
        {CHANGE_CLASSES.map((changeClass) => {
          const id = `change-class-${changeClass}`;
          return (
            <Field key={changeClass} orientation="horizontal">
              <RadioGroupItem value={changeClass} id={id} aria-describedby={`${id}-description`} />
              <FieldContent>
                <FieldLabel htmlFor={id}>{changeClassLabel(changeClass)}</FieldLabel>
                <FieldDescription id={`${id}-description`}>
                  {changeClassDescription(changeClass)}
                </FieldDescription>
              </FieldContent>
            </Field>
          );
        })}
      </RadioGroup>
      <SaveStatus state={state} />
    </FieldSet>
  );
}

/** The largest minimum the server takes (`panelMinimumsInput`). */
const MINIMUM_MAX = 1000;

const isBlank = (value: string) => value.trim() === "";

/**
 * The limits of `panelMinimumsInput` with translated messages: a whole number or nothing per
 * expert type, and a reason while any count is set (DE13). Call it during render.
 */
export function minimumSchema() {
  const count = z
    .string()
    .trim()
    .refine((value) => value === "" || (/^\d+$/.test(value) && Number(value) <= MINIMUM_MAX), {
      error: () => m.rounds_minimum_invalid({ max: MINIMUM_MAX }),
    });
  return z
    .object({
      clinical: count,
      terminology: count,
      architecture: count,
      reason: z.string().max(PANEL_MINIMUM_REASON_MAX, {
        error: () => m.rounds_minimum_reason_too_long({ max: PANEL_MINIMUM_REASON_MAX }),
      }),
    })
    .superRefine((values, ctx) => {
      const anyCount = EXPERT_TYPES.some((type) => !isBlank(values[type]));
      if (anyCount && isBlank(values.reason)) {
        ctx.addIssue({
          code: "custom",
          path: ["reason"],
          message: m.rounds_minimum_reason_required(),
        });
      }
    });
}

// NOTE: no spec governs this, our own design: the minimum stays one form with one save button,
// because its counts and its reason are valid only together.
function MinimumForm({
  status,
  save,
}: Readonly<{
  status: PanelStatus;
  save: (minimums: PanelMinimums, reason: string) => Promise<PanelOutcome>;
}>) {
  const initial = (type: ExpertType) => {
    const value = status.overrides[type];
    return value === undefined ? "" : String(value);
  };
  const form = useAppForm({
    defaultValues: {
      clinical: initial("clinical"),
      terminology: initial("terminology"),
      architecture: initial("architecture"),
      reason: status.overridesReason ?? "",
    },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: minimumSchema() },
    onSubmit: async ({ value, formApi }) => {
      const toCount = (text: string) => (isBlank(text) ? null : Number(text.trim()));
      const minimums: PanelMinimums = {
        clinical: toCount(value.clinical),
        terminology: toCount(value.terminology),
        architecture: toCount(value.architecture),
      };
      let outcome: PanelOutcome;
      try {
        outcome = await save(minimums, value.reason.trim());
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        if (outcome.error === "minimum_reason_required") {
          applyServerRefusal(formApi, { fields: { reason: refusalMessage(outcome.error) } });
        } else {
          applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        }
      }
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
      <FieldSet>
        <FieldLegend>{m.rounds_minimum_legend()}</FieldLegend>
        <FieldDescription>{m.rounds_minimum_help()}</FieldDescription>
        <div className="grid gap-4 sm:grid-cols-3">
          {EXPERT_TYPES.map((type) => (
            <form.AppField key={type} name={type}>
              {(field) => (
                <field.TextField
                  label={expertTypeLabel(type)}
                  description={m.rounds_minimum_class_default({
                    count: status.classDefault[type],
                  })}
                  inputMode="numeric"
                  autoComplete="off"
                />
              )}
            </form.AppField>
          ))}
        </div>
        <form.AppField name="reason">
          {(field) => (
            <field.TextareaField
              label={m.rounds_minimum_reason_label()}
              description={m.rounds_minimum_reason_help({ max: PANEL_MINIMUM_REASON_MAX })}
            />
          )}
        </form.AppField>
      </FieldSet>
      <div>
        <form.AppForm>
          <form.SubmitButton variant="outline">{m.rounds_minimum_save()}</form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}

/** The facilitator's reason for the project's own counts, next to the class defaults (DE13). */
function MinimumReason({ status }: Readonly<{ status: PanelStatus }>) {
  if (status.overridesReason === null) return null;
  return (
    <dl className="flex flex-col gap-1 text-sm">
      <dt className="font-medium">{m.rounds_minimum_reason_heading()}</dt>
      <dd className="whitespace-pre-line text-muted-foreground">{status.overridesReason}</dd>
    </dl>
  );
}

/**
 * One line while every expert type meets the minimum; the table shows when one falls short or
 * when the facilitator opens it. It opens below the button, so the button stays where it is.
 */
function PanelSummary({ status }: Readonly<{ status: PanelStatus }>) {
  const [open, setOpen] = useState(false);
  const tableId = useId();
  const failing = status.shortfall.length > 0;
  const table = (
    <PanelTable
      joined={status.joined}
      minimum={status.minimum}
      caption={m.rounds_panel_caption()}
    />
  );
  if (failing) return table;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>{m.rounds_panel_meets_minimum()}</span>
        <Button
          type="button"
          variant="link"
          className="h-auto p-0"
          aria-expanded={open}
          aria-controls={tableId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? m.rounds_panel_hide_table() : m.rounds_panel_show_table()}
        </Button>
      </p>
      <div id={tableId} hidden={!open}>
        {open && table}
      </div>
    </div>
  );
}

/**
 * The panel section of the Settings page (PR12): the table, whose status column names any
 * shortfall, and while no round has opened the change class and the minimum per expert type.
 */
export function PanelSetup({
  status,
  saveChangeClass,
  saveMinimum,
}: Readonly<{
  status: PanelStatus;
  saveChangeClass: (changeClass: ChangeClass) => Promise<PanelOutcome>;
  saveMinimum: (minimums: PanelMinimums, reason: string) => Promise<PanelOutcome>;
}>) {
  return (
    <section aria-labelledby="panel-heading" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h3 id="panel-heading" className="text-lg font-semibold">
          {m.rounds_panel_heading()}
        </h3>
        <p className="text-muted-foreground">
          {m.rounds_panel_intro({ changeClass: changeClassLabel(status.changeClass) })}
        </p>
      </div>
      <PanelSummary status={status} />
      <MinimumReason status={status} />
      {status.locked ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <LockIcon aria-hidden="true" className="size-4" />
          {m.rounds_panel_locked()}
        </p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <ChangeClassForm current={status.changeClass} save={saveChangeClass} />
          <MinimumForm
            key={`${JSON.stringify(status.overrides)}-${status.overridesReason}`}
            status={status}
            save={saveMinimum}
          />
        </div>
      )}
    </section>
  );
}
