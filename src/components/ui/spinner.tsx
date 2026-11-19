// SPDX-FileCopyrightText: shadcn
// SPDX-License-Identifier: MIT
// Generated from the shadcn/ui registry (https://ui.shadcn.com); edit only for a defect or
// an accessibility fix.

import { cn } from "cn";
import { Loader2Icon } from "lucide-react";

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  return (
    <Loader2Icon
      data-slot="spinner"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  );
}

export { Spinner };
