// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The activity log (AD2), newest first, filtered by action and shown a page at a time. It shows
// the action's label, the project's name, the actor's name and the name of what it acted on,
// never content.
import { ChevronLeftIcon, ChevronRightIcon, HistoryIcon } from "lucide-react";
import { type ReactNode, useId } from "react";
import { EmptyState } from "@/components/shell/route-states";
import { DateTime } from "@/components/status/date-time";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { hasNamedSubject } from "@/lib/activity-subjects";
import { activityLabel } from "@/lib/i18n/activity-labels";
import type { ActivityEntry } from "@/server/admin/queries";

/** The filter value for every action; no action code starts with an underscore. */
export const ALL_ACTIONS = "_all";

function Id({ value }: Readonly<{ value: string }>) {
  return <code className="font-mono text-xs break-all">{value}</code>;
}

function None() {
  return <span className="text-muted-foreground">{m.admin_none()}</span>;
}

/** The target by name; "(removed)" when it no longer exists, a dash for a target without a name. */
function Subject({ entry }: Readonly<{ entry: ActivityEntry }>) {
  if (!hasNamedSubject(entry.targetType)) return <None />;
  if (entry.subject === null) {
    return <span className="text-muted-foreground">{m.admin_subject_removed()}</span>;
  }
  return entry.targetType === "round"
    ? m.admin_subject_round({ number: entry.subject })
    : entry.subject;
}

export function ActivityFilter({
  actions,
  value,
  onChange,
}: Readonly<{
  actions: readonly string[];
  value: string | undefined;
  onChange: (action: string | undefined) => void;
}>) {
  const id = useId();
  // An action filtered on before it was logged still shows as a choice.
  const choices = value === undefined || actions.includes(value) ? actions : [value, ...actions];
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{m.admin_activity_filter_label()}</Label>
      <Select
        value={value ?? ALL_ACTIONS}
        onValueChange={(next) => onChange(next === ALL_ACTIONS ? undefined : next)}
      >
        <SelectTrigger id={id} className="w-full sm:w-80">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_ACTIONS}>{m.admin_activity_filter_all()}</SelectItem>
          {choices.map((action) => (
            <SelectItem key={action} value={action}>
              {activityLabel(action)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ActivityTable({ entries }: Readonly<{ entries: readonly ActivityEntry[] }>) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<HistoryIcon aria-hidden="true" />}
        title={m.admin_activity_empty_title()}
        description={m.admin_activity_empty()}
      />
    );
  }
  return (
    <Table aria-label={m.admin_activity_caption()}>
      <TableCaption className="sr-only">{m.admin_activity_caption()}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.admin_column_time()}</TableHead>
          <TableHead scope="col">{m.admin_column_action()}</TableHead>
          <TableHead scope="col">{m.admin_column_actor()}</TableHead>
          <TableHead scope="col">{m.admin_column_project()}</TableHead>
          <TableHead scope="col">{m.admin_column_target()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id} className="align-top">
            <TableCell>
              <DateTime value={entry.occurredAt} />
            </TableCell>
            <TableCell className="whitespace-normal">{activityLabel(entry.action)}</TableCell>
            <TableCell className="whitespace-normal">
              {entry.actorUserId === null ? (
                <span className="text-muted-foreground">{m.admin_actor_none()}</span>
              ) : entry.actorName === "" ? (
                <Id value={entry.actorUserId} />
              ) : (
                entry.actorName
              )}
            </TableCell>
            <TableCell className="whitespace-normal">
              {entry.projectName ??
                (entry.projectId === null ? (
                  <None />
                ) : (
                  <span className="text-muted-foreground">{m.admin_project_removed()}</span>
                ))}
            </TableCell>
            <TableCell className="whitespace-normal">
              <Subject entry={entry} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/**
 * Previous and next links between the pages of the log, with the page number in words. A link
 * to no page shows as plain, dimmed text, so the pair keeps its place.
 */
export function ActivityPager({
  page,
  pages,
  pageLink,
}: Readonly<{
  page: number;
  pages: number;
  /** A link to page `target` holding `children`. */
  pageLink: (target: number, children: ReactNode) => ReactNode;
}>) {
  if (pages <= 1) return null;
  const previous = (
    <>
      <ChevronLeftIcon aria-hidden="true" className="size-4" />
      {m.admin_activity_previous()}
    </>
  );
  const next = (
    <>
      {m.admin_activity_next()}
      <ChevronRightIcon aria-hidden="true" className="size-4" />
    </>
  );
  const dimmed = "inline-flex items-center gap-1 text-muted-foreground";
  return (
    <nav
      aria-label={m.admin_activity_pages_label()}
      className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"
    >
      {page > 1 ? pageLink(page - 1, previous) : <span className={dimmed}>{previous}</span>}
      <span>{m.admin_activity_page({ page, pages })}</span>
      {page < pages ? pageLink(page + 1, next) : <span className={dimmed}>{next}</span>}
    </nav>
  );
}
