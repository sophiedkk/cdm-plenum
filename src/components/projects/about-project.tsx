// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// "About this project" at the bottom of the participant's home (PR5 to PR7, ADR 0019): one quiet
// disclosure with the stakeholder groups and leaving the project. The names of the people in a
// group show only when the facilitator allows it (PR7); the server leaves them out otherwise.
import { ChevronRightIcon } from "lucide-react";
import { useId, useState } from "react";
import { LeaveProject } from "@/components/members/leave-project";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { cn } from "@/lib/utils";
import type { VisibleGroup } from "@/server/projects/queries";

function GroupPeople({ group }: Readonly<{ group: VisibleGroup }>) {
  if (group.names === null) {
    return (
      <p>
        {group.participants === 1
          ? m.projects_about_people_one()
          : m.projects_about_people_many({ count: group.participants })}
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-0.5">
      {group.names.map((name, index) => (
        // Names repeat and carry no id, so the place in the list is the key.
        // biome-ignore lint/suspicious/noArrayIndexKey: see above
        <li key={index} className={name === "" ? "text-muted-foreground" : undefined}>
          {name === "" ? m.members_name_not_set() : name}
        </li>
      ))}
    </ul>
  );
}

export function AboutProject({
  projectName,
  groups,
  leave,
  onLeft,
}: Readonly<{
  projectName: string;
  groups: readonly VisibleGroup[];
  leave: () => Promise<Outcome<unknown>>;
  onLeft: () => Promise<void> | void;
}>) {
  const [open, setOpen] = useState(false);
  const base = useId();
  const shown = groups.filter((group) => group.participants > 0);
  return (
    <div className="mt-12 border-t pt-6">
      <Button
        id={`${base}-toggle`}
        type="button"
        variant="link"
        aria-expanded={open}
        aria-controls={`${base}-panel`}
        onClick={() => setOpen(!open)}
        className="h-auto px-0 text-muted-foreground"
      >
        <ChevronRightIcon
          aria-hidden="true"
          data-icon="inline-start"
          className={cn("motion-safe:transition-transform", open && "rotate-90")}
        />
        {m.projects_about_title()}
      </Button>
      <section
        id={`${base}-panel`}
        aria-labelledby={`${base}-toggle`}
        hidden={!open}
        className="mt-4 flex flex-col gap-8 rounded-lg border p-4 sm:p-6"
      >
        <div className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">{m.members_groups_title()}</h2>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(10rem,1fr))] gap-x-6 gap-y-4">
            {shown.map((group) => (
              <div key={group.id} className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold text-muted-foreground">{group.name}</h3>
                <GroupPeople group={group} />
              </div>
            ))}
          </div>
        </div>
        <LeaveProject projectName={projectName} leave={leave} onLeft={onLeft} />
      </section>
    </div>
  );
}
