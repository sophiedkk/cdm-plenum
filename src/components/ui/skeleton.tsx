// SPDX-FileCopyrightText: shadcn
// SPDX-License-Identifier: MIT
// Generated from the shadcn/ui registry (https://ui.shadcn.com); edit only for a defect or
// an accessibility fix.

import { cn } from "cn";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn("animate-pulse rounded-md bg-muted", className)}
      {...props}
    />
  );
}

export { Skeleton };
