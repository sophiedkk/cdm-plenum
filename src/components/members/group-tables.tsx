// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The stakeholder groups of a project (PR6). The facilitator sees the participants by name and
// manages the groups; a participant sees only how many take part in each group.
import type { ReactNode } from "react";
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
import type { GroupWithMembers, StakeholderGroup } from "@/server/projects/queries";
import { ExpertTypeBadge } from "./member-badges";

/** The groups with the number of participants in each, and no names. */
export function GroupCountTable({ groups }: Readonly<{ groups: readonly StakeholderGroup[] }>) {
  return (
    <Table>
      <TableCaption className="sr-only">{m.members_groups_caption()}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.members_column_group()}</TableHead>
          <TableHead scope="col">{m.members_column_expert_type()}</TableHead>
          <TableHead scope="col" className="text-right">
            {m.members_column_participant_count()}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow key={group.id}>
            <TableHead scope="row" className="font-medium">
              {group.name}
            </TableHead>
            <TableCell>
              <ExpertTypeBadge expertType={group.expertType} />
            </TableCell>
            <TableCell className="text-right tabular-nums">{group.participants}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

/** The groups with their participants by name, and an actions cell per group. */
export function GroupMemberTable({
  groups,
  actions,
}: Readonly<{
  groups: readonly GroupWithMembers[];
  actions: (group: GroupWithMembers) => ReactNode;
}>) {
  return (
    <Table>
      <TableCaption className="sr-only">{m.members_groups_caption()}</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">{m.members_column_group()}</TableHead>
          <TableHead scope="col">{m.members_column_expert_type()}</TableHead>
          <TableHead scope="col">{m.members_column_participants()}</TableHead>
          <TableHead scope="col">{m.members_column_actions()}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {groups.map((group) => (
          <TableRow key={group.id} className="align-top">
            <TableHead scope="row" className="font-medium">
              {group.name}
            </TableHead>
            <TableCell>
              <ExpertTypeBadge expertType={group.expertType} />
            </TableCell>
            <TableCell className="whitespace-normal">
              {group.members.length === 0 ? (
                <span className="text-muted-foreground">{m.members_no_participants()}</span>
              ) : (
                <ul className="flex flex-col gap-1">
                  {group.members.map((member) => (
                    <li key={member.memberId}>
                      {member.name === "" ? (
                        member.email
                      ) : (
                        <>
                          {member.name}{" "}
                          <span className="text-muted-foreground">({member.email})</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-2">{actions(group)}</div>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
