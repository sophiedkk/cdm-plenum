// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/**
 * A dialog of the board: a title, a description and a body that scrolls on a small screen. It is
 * anchored to the top, so it grows downward and nothing above a field that adds fields moves.
 * Escape and the form's own cancel button close it; the shadcn close button is left out because
 * its text is not translated (Q-I18N-1). Radix returns focus to the trigger on close.
 */
export function BoardDialog({
  open,
  onOpenChange,
  title,
  description,
  wide,
  children,
}: Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  wide?: boolean;
  children: ReactNode;
}>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "top-[8vh] max-h-[88vh] translate-y-0 overflow-y-auto sm:max-w-2xl",
          wide && "sm:max-w-4xl",
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  );
}
