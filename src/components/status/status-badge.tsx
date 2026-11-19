// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/** The tones a status can take. A tone only adds colour; the label carries the meaning. */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "border-border bg-transparent text-foreground",
  info: "bg-secondary text-secondary-foreground",
  success: "border-success/30 bg-success/10 text-success",
  warning: "border-warning/30 bg-warning/10 text-warning",
  danger: "border-destructive/30 bg-destructive/10 text-destructive",
};

/**
 * A status or outcome with its text, an optional icon and a tone (Q-ACC-2, WCAG 1.4.1). The
 * label is required, so colour is never the only signal; the icon is decoration.
 */
export function StatusBadge({
  label,
  tone = "neutral",
  icon: Icon,
  className,
}: Readonly<{ label: string; tone?: StatusTone; icon?: LucideIcon; className?: string }>) {
  return (
    <Badge variant="outline" data-tone={tone} className={cn(TONE_CLASSES[tone], className)}>
      {Icon && <Icon aria-hidden="true" data-icon="inline-start" />}
      {label}
    </Badge>
  );
}
