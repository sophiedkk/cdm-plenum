// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// Every account with its state (AD1). Deactivating asks for a confirmation; reactivating does
// not, as it only gives back what was there.
import { CircleCheckIcon, CircleSlashIcon, UserCheckIcon, UserXIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/status/status-badge";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { refusalMessage } from "@/lib/i18n/refusals";
import type { AccountRow } from "@/server/admin/queries";

type AccountCall = (userId: string) => Promise<Outcome<unknown>>;

/** Runs an account call and reports its outcome in a toast. */
async function runAccountCall(
  call: () => Promise<Outcome<unknown>>,
  success: string,
  onDone: () => Promise<void> | void,
): Promise<boolean> {
  try {
    const outcome = await call();
    if (!outcome.ok) {
      toast.error(refusalMessage(outcome.error));
      return false;
    }
    toast.success(success);
    await onDone();
    return true;
  } catch {
    toast.error(m.common_error_unexpected());
    return false;
  }
}

function DeactivateDialog({
  account,
  deactivate,
  onChanged,
}: Readonly<{
  account: AccountRow;
  deactivate: AccountCall;
  onChanged: () => Promise<void> | void;
}>) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={m.admin_deactivate_label({ email: account.email })}
        >
          <UserXIcon aria-hidden="true" data-icon="inline-start" />
          {m.admin_deactivate()}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{m.admin_deactivate_title({ email: account.email })}</AlertDialogTitle>
          <AlertDialogDescription>{m.admin_deactivate_body()}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            aria-busy={pending}
            onClick={async () => {
              setPending(true);
              const done = await runAccountCall(
                () => deactivate(account.id),
                m.admin_deactivated({ email: account.email }),
                onChanged,
              );
              setPending(false);
              if (done) setOpen(false);
            }}
          >
            {m.admin_deactivate_submit()}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function AccountsTable({
  accounts,
  currentUserId,
  deactivate,
  reactivate,
  onChanged,
}: Readonly<{
  accounts: readonly AccountRow[];
  currentUserId: string;
  deactivate: AccountCall;
  reactivate: AccountCall;
  onChanged: () => Promise<void> | void;
}>) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <Table>
      <TableCaption className="sr-only">{m.admin_accounts_caption()}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.admin_column_email()}</TableHead>
          <TableHead scope="col">{m.admin_column_name()}</TableHead>
          <TableHead scope="col">{m.admin_column_status()}</TableHead>
          <TableHead scope="col">{m.admin_column_actions()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => {
          const own = account.id === currentUserId;
          return (
            <TableRow key={account.id}>
              <TableHead scope="row" className="font-medium">
                {account.email}
                {own && <span className="font-normal text-muted-foreground"> {m.admin_you()}</span>}
              </TableHead>
              <TableCell>
                {account.name === "" ? (
                  <span className="text-muted-foreground">{m.admin_name_missing()}</span>
                ) : (
                  account.name
                )}
              </TableCell>
              <TableCell>
                {account.deactivatedAt === null ? (
                  <StatusBadge
                    tone="success"
                    icon={CircleCheckIcon}
                    label={m.admin_status_active()}
                  />
                ) : (
                  <StatusBadge
                    tone="danger"
                    icon={CircleSlashIcon}
                    label={m.admin_status_deactivated()}
                  />
                )}
              </TableCell>
              <TableCell>
                {own ? null : account.deactivatedAt === null ? (
                  <DeactivateDialog
                    account={account}
                    deactivate={deactivate}
                    onChanged={onChanged}
                  />
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy === account.id}
                    aria-label={m.admin_reactivate_label({ email: account.email })}
                    onClick={async () => {
                      setBusy(account.id);
                      await runAccountCall(
                        () => reactivate(account.id),
                        m.admin_reactivated({ email: account.email }),
                        onChanged,
                      );
                      setBusy(null);
                    }}
                  >
                    <UserCheckIcon aria-hidden="true" data-icon="inline-start" />
                    {m.admin_reactivate()}
                  </Button>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
