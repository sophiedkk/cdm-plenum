// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The phases of a project as one row of steps (PR4, PR11, PR13): a check on a finished phase, the
// current one marked, later ones dashed. The state is in the text for a screen reader; the
// icon and the border only show it. NOTE: owner decisions 2026-11-20 and 2026-11-25 (ADR 0022).
// A done phase links to its recap, the current phase to the phase home (the project index: the
// Overview or the participant's home); later phases are no links.
import { Link } from "@tanstack/react-router";
import { CheckIcon } from "lucide-react";
import { m } from "@/i18n/messages";
import { projectPhaseLabel } from "@/lib/i18n/labels";
import { type PhaseStepState, type ProjectPhase, phaseSteps } from "@/lib/project-phases";
import { cn } from "@/lib/utils";

const STEP =
  "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-sm leading-5";

const STATE_CLASS: Record<PhaseStepState, string> = {
  done: "border-border text-foreground",
  current: "border-foreground bg-muted font-semibold text-foreground",
  next: "border-dashed border-border text-muted-foreground",
  later: "border-dashed border-border text-muted-foreground",
};

function stateText(state: PhaseStepState): string {
  if (state === "done") return m.projects_step_done();
  if (state === "current") return m.projects_step_current();
  return m.projects_step_later();
}

export function PhaseSteps({
  projectId,
  phase,
  here,
}: Readonly<{
  projectId: string;
  phase: ProjectPhase;
  /** The phase whose recap the page shows, if any (PR13). */
  here?: ProjectPhase | undefined;
}>) {
  return (
    <ol aria-label={m.projects_steps_label()} className="flex flex-wrap gap-1">
      {phaseSteps(phase).map((step) => {
        const content = (
          <>
            {step.state === "done" && <CheckIcon aria-hidden="true" className="size-4" />}
            {projectPhaseLabel(step.phase)}
            <span className="sr-only">
              , {stateText(step.state)}
              {step.state === "done" && step.phase !== here && `, ${m.projects_step_recap()}`}
            </span>
          </>
        );
        return (
          <li
            key={step.phase}
            aria-current={step.state === "current" ? "step" : undefined}
            className="flex"
          >
            {step.state === "done" ? (
              <Link
                to="/projects/$projectId/recap/$phase"
                params={{ projectId, phase: step.phase }}
                aria-current={step.phase === here ? "page" : undefined}
                className={cn(
                  STEP,
                  STATE_CLASS.done,
                  "hover:bg-muted aria-[current=page]:border-foreground aria-[current=page]:font-semibold",
                )}
              >
                {content}
              </Link>
            ) : step.state === "current" ? (
              <Link
                to="/projects/$projectId"
                params={{ projectId }}
                activeOptions={{ exact: true }}
                className={cn(STEP, STATE_CLASS.current, "hover:bg-accent")}
              >
                {content}
              </Link>
            ) : (
              <span className={cn(STEP, STATE_CLASS[step.state])}>{content}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Four small bars with the current phase's name: the phase in a projects list row. */
export function MiniPhase({ phase }: Readonly<{ phase: ProjectPhase }>) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden="true" className="inline-grid grid-cols-4 gap-0.5">
        {phaseSteps(phase).map((step) => (
          <span
            key={step.phase}
            data-state={step.state}
            className={cn(
              "h-1.5 w-5 rounded-full",
              step.state === "current"
                ? "bg-foreground"
                : step.state === "done"
                  ? "bg-muted-foreground"
                  : "bg-border",
            )}
          />
        ))}
      </span>
      <span className="font-semibold text-foreground">
        <span className="sr-only">{m.projects_row_phase()} </span>
        {projectPhaseLabel(phase)}
      </span>
    </span>
  );
}
