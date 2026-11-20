// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A participant leaves the project (PR5), after a confirmation in a dialog.
import { LogOutIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
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
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { refusalMessage } from "@/lib/i18n/refusals";

export function LeaveProject({
  projectName,
  leave,
  onLeft,
}: Readonly<{
  projectName: string;
  leave: () => Promise<Outcome<unknown>>;
  onLeft: () => Promise<void> | void;
}>) {
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);
    try {
      const outcome = await leave();
      if (outcome.ok) {
        toast.success(m.members_left({ project: projectName }));
        await onLeft();
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
    <div className="flex flex-col items-start gap-3">
      <p className="text-muted-foreground">{m.members_leave_description()}</p>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="outline">
            <LogOutIcon aria-hidden="true" data-icon="inline-start" />
            {m.members_leave()}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {m.members_leave_confirm_title({ project: projectName })}
            </AlertDialogTitle>
            <AlertDialogDescription>{m.members_leave_confirm_body()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              aria-busy={pending}
              onClick={() => void confirm()}
            >
              {m.members_leave_confirm()}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
