// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// One project in the projects list (PR2, PR8): the name, the phase, the facilitator's role and
// what waits for this person there with its deadline, or a quiet "nothing for you now".
import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";
import { formatShortDate, useTimeZone } from "@/components/rounds/format";
import { m } from "@/i18n/messages";
import { projectPhaseLabel } from "@/lib/i18n/labels";
import type { Waiting } from "@/lib/project-home";
import { cn } from "@/lib/utils";
import type { ProjectRow as Row } from "@/server/projects/overview";
import { MiniPhase } from "./phase-steps";

/** The one line of what waits, in words; null when nothing does. */
export function waitingText(waiting: Waiting, timeZone: string): string | null {
  switch (waiting.kind) {
    case "task": {
      const { task } = waiting;
      if (task.kind === "scope") return m.projects_waiting_scope();
      if (task.kind === "discover" && task.groupCheck.asked && !task.groupCheck.done)
        return m.projects_waiting_check();
      if (task.kind === "discover")
        return task.firstLook.answered < task.firstLook.total
          ? m.projects_waiting_first_look()
          : m.projects_waiting_discover();
      if (task.kind !== "rate") return null;
      const count = task.total - task.rated;
      const date = formatShortDate(task.closesAt, timeZone);
      return count === 1
        ? m.projects_waiting_rate_one({ number: task.number, date })
        : m.projects_waiting_rate_many({ number: task.number, count, date });
    }
    case "checklist": {
      if (waiting.round) {
        const text =
          waiting.roundKind === "values"
            ? m.projects_waiting_value_round
            : m.projects_waiting_round;
        return text({
          number: waiting.round.number,
          completed: waiting.round.completed,
          raters: waiting.round.raters,
          date: formatShortDate(waiting.round.closesAt, timeZone),
        });
      }
      const phase = projectPhaseLabel(waiting.next);
      return waiting.open === 1
        ? m.projects_waiting_steps_one({ phase })
        : m.projects_waiting_steps_many({ count: waiting.open, phase });
    }
    case "ready":
      return m.projects_waiting_ready({ phase: projectPhaseLabel(waiting.next) });
    case "nothing":
      return null;
  }
}

/** A row of the list; `link` wraps the row's content in the link to the project. */
export function ProjectRow({
  project,
  link,
}: Readonly<{
  project: Row;
  link: (children: ReactNode, className: string) => ReactNode;
}>) {
  const timeZone = useTimeZone();
  const waiting = waitingText(project.waiting, timeZone);
  return link(
    <>
      <span
        className={cn(
          "col-start-1 text-lg font-semibold",
          waiting === null && "text-muted-foreground",
        )}
      >
        {project.name}
      </span>
      <span className="col-start-1 flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
        <MiniPhase phase={project.phase} />
        {project.role === "facilitator" && <span>{m.projects_row_facilitate()}</span>}
      </span>
      {waiting === null ? (
        <span className="col-start-1 text-sm text-muted-foreground">
          {m.projects_waiting_nothing()}
        </span>
      ) : (
        <span className="col-start-1 flex items-center gap-2">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-foreground" />
          {waiting}
        </span>
      )}
      <ChevronRightIcon
        aria-hidden="true"
        className="col-start-2 row-span-3 row-start-1 size-4 self-center text-muted-foreground"
      />
    </>,
    "-mx-2 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg px-2 py-4 outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50",
  );
}
