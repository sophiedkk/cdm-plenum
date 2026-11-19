// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The activity log (AD2), newest first and filtered by action. It shows ids, action codes and
// the actor's name only, never content. An action code is shown as the code the log stores.
import { HistoryIcon } from "lucide-react";
import { useId } from "react";
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
import type { ActivityEntry } from "@/server/admin/queries";

/** The filter value for every action; no action code starts with an underscore. */
export const ALL_ACTIONS = "_all";

function Id({ value }: Readonly<{ value: string | null }>) {
  if (value === null) return <span className="text-muted-foreground">{m.admin_none()}</span>;
  return <code className="font-mono text-xs break-all">{value}</code>;
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
              {action}
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
    <Table>
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
            <TableCell>
              <code className="font-mono text-xs">{entry.action}</code>
            </TableCell>
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
              <Id value={entry.projectId} />
            </TableCell>
            <TableCell className="whitespace-normal">
              {entry.targetType === null ? (
                <Id value={null} />
              ) : (
                <span className="flex flex-col gap-1">
                  <code className="font-mono text-xs">{entry.targetType}</code>
                  {entry.targetId !== null && <Id value={entry.targetId} />}
                </span>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
