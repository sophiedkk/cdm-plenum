// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The application rights by e-mail address (AD1, owner decision 2026-11-19): the grant form
// and the table with a revoke button per right.
import { revalidateLogic } from "@tanstack/react-form";
import { KeyRoundIcon, ShieldIcon, UserStarIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { useAppForm } from "@/components/form/app-form";
import { StatusBadge } from "@/components/status/status-badge";
import { Button } from "@/components/ui/button";
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
import type { Outcome } from "@/lib/forms/outcome";
import { applyServerRefusal } from "@/lib/forms/server-refusal";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { AppRole } from "@/server/admin/app-roles";
import type { AppRoleHolder } from "@/server/admin/queries";

/** The application rights in the order the screens list them. */
const RIGHTS = ["administrator", "facilitator"] as const satisfies readonly AppRole[];

const RIGHT_LABELS: Record<AppRole, () => string> = {
  administrator: () => m.admin_right_administrator(),
  facilitator: () => m.admin_right_facilitator(),
};

/** The name of an application right in the active locale. */
export function rightLabel(right: AppRole): string {
  return RIGHT_LABELS[right]();
}

/** The longest address `appRoleInput` accepts (src/server/admin/schemas.ts). */
const EMAIL_MAX = 254;

/** The limits of `appRoleInput` with translated messages. */
export function grantSchema() {
  return z.object({
    email: z
      .string()
      .trim()
      .max(EMAIL_MAX, { error: () => m.admin_grant_email_too_long({ max: EMAIL_MAX }) })
      .pipe(z.email({ error: () => m.admin_grant_email_invalid() })),
    role: z.enum(RIGHTS, { error: () => m.admin_grant_role_required() }),
  });
}

/** Grants a right to an e-mail address, also before the address has an account (PR1). */
export function GrantRightForm({
  grant,
  onGranted,
}: Readonly<{
  grant: (input: { email: string; role: AppRole }) => Promise<Outcome<unknown>>;
  onGranted: (email: string, role: AppRole) => Promise<void> | void;
}>) {
  const form = useAppForm({
    defaultValues: { email: "", role: "" },
    validationLogic: revalidateLogic(),
    validators: { onDynamic: grantSchema() },
    onSubmit: async ({ value, formApi }) => {
      const input = grantSchema().parse(value);
      let outcome: Outcome<unknown>;
      try {
        outcome = await grant(input);
      } catch {
        applyServerRefusal(formApi, { form: m.common_error_unexpected() });
        return;
      }
      if (!outcome.ok) {
        applyServerRefusal(formApi, { form: refusalMessage(outcome.error) });
        return;
      }
      formApi.reset();
      await onGranted(input.email, input.role);
    },
  });

  return (
    <form
      noValidate
      aria-labelledby="grant-title"
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <h3 id="grant-title" className="text-lg font-semibold">
        {m.admin_grant_title()}
      </h3>
      <form.AppForm>
        <form.FormErrors />
      </form.AppForm>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        <form.AppField name="email">
          {(field) => (
            <field.TextField
              type="email"
              label={m.admin_grant_email_label()}
              autoComplete="off"
              spellCheck={false}
              className="sm:max-w-xs"
            />
          )}
        </form.AppField>
        <form.AppField name="role">
          {(field) => (
            <field.SelectField
              label={m.admin_grant_role_label()}
              placeholder={m.admin_grant_role_placeholder()}
              options={RIGHTS.map((right) => ({ value: right, label: rightLabel(right) }))}
              className="sm:max-w-xs"
            />
          )}
        </form.AppField>
      </div>
      <div>
        <form.AppForm>
          <form.SubmitButton icon={<KeyRoundIcon aria-hidden="true" data-icon="inline-start" />}>
            {m.admin_grant_submit()}
          </form.SubmitButton>
        </form.AppForm>
      </div>
    </form>
  );
}

/** The addresses with a right; each right has its own revoke button. */
export function AppRightsTable({
  holders,
  revoke,
  onRevoked,
}: Readonly<{
  holders: readonly AppRoleHolder[];
  revoke: (input: { email: string; role: AppRole }) => Promise<Outcome<unknown>>;
  onRevoked: () => Promise<void> | void;
}>) {
  const [busy, setBusy] = useState<string | null>(null);

  async function onRevoke(email: string, role: AppRole) {
    setBusy(`${email} ${role}`);
    try {
      const outcome = await revoke({ email, role });
      if (outcome.ok) {
        toast.success(m.admin_right_revoked({ right: rightLabel(role), email }));
        await onRevoked();
      } else {
        toast.error(refusalMessage(outcome.error));
      }
    } catch {
      toast.error(m.common_error_unexpected());
    } finally {
      setBusy(null);
    }
  }

  return (
    <Table aria-label={m.admin_rights_caption()}>
      <TableCaption className="sr-only">{m.admin_rights_caption()}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.admin_column_email()}</TableHead>
          <TableHead scope="col">{m.admin_column_rights()}</TableHead>
          <TableHead scope="col">{m.admin_column_account()}</TableHead>
          <TableHead scope="col">{m.admin_column_actions()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {holders.map((holder) => (
          <TableRow key={holder.email}>
            <TableHead scope="row" className="font-medium">
              {holder.email}
            </TableHead>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                {holder.roles.map((role) => (
                  <StatusBadge
                    key={role}
                    tone="info"
                    icon={role === "administrator" ? ShieldIcon : UserStarIcon}
                    label={rightLabel(role)}
                  />
                ))}
              </div>
            </TableCell>
            <TableCell>
              {holder.hasAccount ? m.admin_account_exists() : m.admin_account_missing()}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">
                {holder.roles.map((role) => (
                  <Button
                    key={role}
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy === `${holder.email} ${role}`}
                    aria-label={m.admin_revoke_right_label({
                      right: rightLabel(role),
                      email: holder.email,
                    })}
                    onClick={() => void onRevoke(holder.email, role)}
                  >
                    <XIcon aria-hidden="true" data-icon="inline-start" />
                    {m.admin_revoke_right({ right: rightLabel(role) })}
                  </Button>
                ))}
              </div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
