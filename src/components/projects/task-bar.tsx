// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The task bar under the title of a participant's step page (P1 of the UI/UX analysis of
// 2026-11-25, owner decision 2026-11-25): what to do on this page in one sentence, the progress,
// and, once nothing is left, "You are done" with what happens next and the way back; the count
// stays. The status region stays in place, so a screen reader announces the change to done.
import { Link } from "@tanstack/react-router";
import { CircleCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";

/** What the bar shows instead of its sentence once nothing is left. */
export interface TaskBarDone {
  /** The heading; "You are done" when left out. */
  title?: string;
  /** What happens next, in one line. */
  next: string;
}

export function TaskBar({
  projectId,
  sentence,
  progress,
  done,
  filledBack = false,
}: Readonly<{
  projectId: string;
  /** What to do on this page; left out where the done state is all the page says. */
  sentence?: string;
  /** The progress parts, such as "1 of 3 answered"; empty for none. */
  progress?: readonly string[];
  /** Set once nothing is left. */
  done?: TaskBarDone | null;
  /** The way back is the page's one filled button, for a page that has no other. */
  filledBack?: boolean;
}>) {
  return (
    <div
      data-testid="task-bar"
      className="mb-6 flex flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-xs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        {!done && sentence && <p className="max-w-3xl">{sentence}</p>}
        <div role="status" className="flex flex-col gap-1">
          {done && (
            <>
              <h3 className="flex items-center gap-2 type-section">
                <CircleCheckIcon aria-hidden="true" className="size-5 shrink-0 text-success" />
                {done.title ?? m.projects_bar_done_title()}
              </h3>
              <p>{done.next}</p>
            </>
          )}
          {progress?.map((part) => (
            <p key={part} className="text-sm text-muted-foreground">
              {part}
            </p>
          ))}
        </div>
      </div>
      {done && (
        <div>
          <Button asChild variant={filledBack ? "default" : "outline"}>
            <Link to="/projects/$projectId" params={{ projectId }}>
              {m.projects_back_task()}
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
