// SPDX-FileCopyrightText: shadcn
// SPDX-License-Identifier: MIT
// Generated from the shadcn/ui registry (https://ui.shadcn.com); edit only for a defect or
// an accessibility fix.

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";
import { useThemeChoice } from "@/components/shell/theme-switch";
import { m } from "@/i18n/messages";

// Adapted from the shadcn/ui registry: the theme follows the app's theme choice (no next-themes),
// and the toast region has a translated name.
const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      theme={useThemeChoice()}
      className="toaster group"
      containerAriaLabel={m.common_notifications()}
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin motion-reduce:animate-none" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
