// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The stakeholder groups of a project (PR6). The facilitator sees the raters by name and address
// and manages the groups; a participant sees how many take part in each group, and their names
// when the facilitator turned that on (PR7).
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
import type { GroupWithMembers, VisibleGroup } from "@/server/projects/queries";
import { ExpertTypeBadge } from "./member-badges";

/** A name in a list, or a note that the person has not set one. */
function PersonName({ name }: Readonly<{ name: string }>) {
  return name === "" ? (
    <span className="text-muted-foreground">{m.members_name_not_set()}</span>
  ) : (
    name
  );
}

/** The groups with the number of participants in each, and their names only when the server sent them. */
export function GroupCountTable({ groups }: Readonly<{ groups: readonly VisibleGroup[] }>) {
  const showNames = groups.some((group) => group.names !== null);
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
          {showNames && <TableHead scope="col">{m.members_column_names()}</TableHead>}
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
            {showNames && (
              <TableCell className="whitespace-normal">
                {group.names?.length ? (
                  <ul className="flex flex-col gap-1">
                    {group.names.map((name, index) => (
                      // Names repeat and carry no id, so the place in the list is the key.
                      // biome-ignore lint/suspicious/noArrayIndexKey: see above
                      <li key={index}>
                        <PersonName name={name} />
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted-foreground">{m.members_no_participants()}</span>
                )}
              </TableCell>
            )}
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
                    <li key={member.memberId} className="flex flex-wrap items-center gap-2">
                      <span>
                        {member.name === "" ? (
                          member.email
                        ) : (
                          <>
                            {member.name}{" "}
                            <span className="text-muted-foreground">({member.email})</span>
                          </>
                        )}
                      </span>
                      {member.role === "facilitator" && <RoleBadge projectRole="facilitator" />}
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
