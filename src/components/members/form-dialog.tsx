// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// A button that opens one form in a dialog (ADR 0018: forms off the page until needed). The form
// renders only while the dialog is open, so it starts empty each time.
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { m } from "@/i18n/messages";

export function FormDialog({
  trigger,
  title,
  description,
  children,
}: Readonly<{
  /** The button that opens the dialog. */
  trigger: ReactNode;
  title: string;
  description?: string;
  /** The form; `close` closes the dialog after a save, `cancel` is its Cancel button. */
  children: (dialog: { close: () => void; cancel: ReactNode }) => ReactNode;
}>) {
  const [open, setOpen] = useState(false);
  const cancel = (
    <DialogClose asChild>
      <Button type="button" variant="outline">
        {m.common_cancel()}
      </Button>
    </DialogClose>
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        showCloseButton={false}
        {...(description === undefined ? { "aria-describedby": undefined } : {})}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description !== undefined && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {open && children({ close: () => setOpen(false), cancel })}
      </DialogContent>
    </Dialog>
  );
}
