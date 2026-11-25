// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The stakeholder groups of a project for the facilitator (PR6): the raters by name and address,
// with the actions on each group. A participant reads the groups on the project home (PR7).
import type { ReactNode } from "react";
import { RoleBadge } from "@/components/projects/project-badges";
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
import type { GroupWithMembers } from "@/server/projects/queries";
import { ExpertTypeBadge } from "./member-badges";

/** A name in a list, or a note that the person has not set one. */
function PersonName({ name }: Readonly<{ name: string }>) {
  return name === "" ? (
    <span className="text-muted-foreground">{m.members_name_not_set()}</span>
  ) : (
    name
  );
}

/**
 * One table of people for the facilitator (ADR 0018): a row group per stakeholder group, headed
 * by the group's name, expert type and actions, then one row per person in it.
 */
export function GroupPeopleTable({
  groups,
  actions,
}: Readonly<{
  groups: readonly GroupWithMembers[];
  actions: (group: GroupWithMembers) => ReactNode;
}>) {
  return (
    <Table aria-label={m.members_groups_caption()}>
      <TableCaption className="sr-only">{m.members_groups_caption()}</TableCaption>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead scope="col">{m.members_column_name()}</TableHead>
          <TableHead scope="col">{m.members_column_email()}</TableHead>
          <TableHead scope="col">
            <span className="sr-only">{m.members_column_actions()}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      {groups.map((group) => (
        <TableBody key={group.id} className="border-b last:border-b-0">
          <TableRow className="bg-muted/50 hover:bg-muted/50">
            <TableHead scope="rowgroup" colSpan={2} className="py-1.5">
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{group.name}</span>
                <ExpertTypeBadge expertType={group.expertType} />
              </span>
            </TableHead>
            <TableCell className="py-1.5">
              <div className="flex flex-wrap justify-end gap-2">{actions(group)}</div>
            </TableCell>
          </TableRow>
          {group.members.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={3} className="text-muted-foreground">
                {m.members_no_participants()}
              </TableCell>
            </TableRow>
          ) : (
            group.members.map((member) => (
              <TableRow key={member.memberId}>
                <TableHead scope="row" className="font-normal">
                  <span className="flex flex-wrap items-center gap-2">
                    <PersonName name={member.name} />
                    {member.role === "facilitator" && <RoleBadge projectRole="facilitator" />}
                  </span>
                </TableHead>
                <TableCell>{member.email}</TableCell>
                <TableCell />
              </TableRow>
            ))
          )}
        </TableBody>
      ))}
    </Table>
  );
}
