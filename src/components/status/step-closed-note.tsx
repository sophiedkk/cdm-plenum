// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The one line a participant reads where the phase closed a step's write controls (PR9), so the
// page matches what the server accepts. The text carries the meaning; the icon only adds to it.
import { LockIcon } from "lucide-react";
import { m } from "@/i18n/messages";
import { cn } from "@/lib/utils";

export function StepClosedNote({ className }: Readonly<{ className?: string }>) {
  return (
    <p
      data-testid="step-closed-note"
      className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}
    >
      <LockIcon aria-hidden="true" className="size-4 shrink-0" />
      {m.common_step_closed()}
    </p>
  );
}
