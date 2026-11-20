// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project header on every project page (PR4, PR8, PR11, ADR 0018): the name, one line of the
// scope, the phases as steps with the current one marked in text, and the task line with one
// main button. The facilitator reads the status of the phase there and moves the phase after a
// confirmation shown in the page.
import { Link, useMatchRoute } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useRef, useState } from "react";
import { toast } from "sonner";
import { DateTime } from "@/components/status/date-time";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { projectPhaseLabel } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import {
  adjacentPhase,
  type PhaseDirection,
  type ProjectPhase,
  phaseSteps,
} from "@/lib/project-phases";
import {
  type FacilitatorStatus,
  facilitatorStatus,
  type ParticipantTask,
  type ProjectOverview,
  participantTask,
} from "@/lib/project-tasks";
import { cn } from "@/lib/utils";

/**
 * The phases in order. The current one carries "now" and a border, a finished one "done" and a
 * check; a later one says "later" to a screen reader only, as its place in the row shows it.
 */
export function PhaseSteps({ phase }: Readonly<{ phase: ProjectPhase }>) {
  return (
    <ol
      aria-label={m.projects_steps_label()}
      className="flex flex-wrap items-center gap-0.5 text-sm"
    >
      {phaseSteps(phase).map((step, index) => (
        <li
          key={step.phase}
          aria-current={step.state === "current" ? "step" : undefined}
          className="flex items-center gap-0.5"
        >
          {index > 0 && (
            <ChevronRightIcon aria-hidden="true" className="size-3.5 text-muted-foreground" />
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5",
              step.state === "current"
                ? "border-foreground bg-background font-semibold"
                : "border-transparent",
              step.state !== "current" && step.state !== "done" && "text-muted-foreground",
            )}
          >
            {step.state === "done" && <CheckIcon aria-hidden="true" className="size-3.5" />}
            {projectPhaseLabel(step.phase)}
            {step.state === "done" && (
              <span className="text-xs text-muted-foreground">{m.projects_step_done()}</span>
            )}
            {step.state === "current" && (
              <span className="text-xs font-normal">{m.projects_step_current()}</span>
            )}
            {(step.state === "next" || step.state === "later") && (
              <span className="sr-only">{m.projects_step_later()}</span>
            )}
          </span>
        </li>
      ))}
    </ol>
  );
}

type TaskLink =
  | {
      to:
        | "/projects/$projectId/scope"
        | "/projects/$projectId/board"
        | "/projects/$projectId/brainstorm"
        | "/projects/$projectId/rounds"
        | "/projects/$projectId/export";
    }
  | {
      to: "/projects/$projectId/rounds/$roundId/rate" | "/projects/$projectId/rounds/$roundId";
      roundId: string;
    };

function ActionLink({
  projectId,
  link,
  icon: Icon = ArrowRightIcon,
  children,
}: Readonly<{ projectId: string; link: TaskLink; icon?: LucideIcon; children: ReactNode }>) {
  const params = "roundId" in link ? { projectId, roundId: link.roundId } : { projectId };
  const matchRoute = useMatchRoute();
  // A button to the page the person is on goes nowhere; the task sentence stays on its own.
  if (matchRoute({ to: link.to, params })) return null;
  return (
    <Button asChild size="sm">
      <Link to={link.to} params={params}>
        {children}
        <Icon aria-hidden="true" data-icon="inline-end" />
      </Link>
    </Button>
  );
}

function addedCount(count: number): string {
  if (count === 0) return m.projects_task_discover_none();
  if (count === 1) return m.projects_task_discover_one();
  return m.projects_task_discover_many({ count });
}

interface TaskView {
  sentence: string;
  done?: string;
  closesAt?: string;
  action?: { label: string; link: TaskLink };
}

function taskView(task: ParticipantTask): TaskView {
  switch (task.kind) {
    case "scope":
      return {
        sentence: m.projects_task_scope(),
        action: {
          label: m.projects_task_scope_action(),
          link: { to: "/projects/$projectId/scope" },
        },
      };
    case "discover":
      return {
        sentence: m.projects_task_discover(),
        done: addedCount(task.added),
        action: {
          label: m.projects_task_discover_action(),
          link: { to: "/projects/$projectId/brainstorm" },
        },
      };
    case "rate":
    case "rated_all": {
      const link = {
        to: "/projects/$projectId/rounds/$roundId/rate",
        roundId: task.roundId,
      } as const;
      return task.kind === "rate"
        ? {
            sentence: m.projects_task_rate({ number: task.number }),
            done: m.projects_task_rated_count({ rated: task.rated, total: task.total }),
            closesAt: task.closesAt,
            action: { label: m.projects_task_rate_action({ number: task.number }), link },
          }
        : {
            sentence: m.projects_task_rated_all({ number: task.number }),
            done: m.projects_task_rated_count({ rated: task.total, total: task.total }),
            closesAt: task.closesAt,
            action: { label: m.projects_task_rated_all_action(), link },
          };
    }
    case "round_closing":
      return { sentence: m.projects_task_round_closing({ number: task.number }) };
    case "wait":
      return { sentence: m.projects_task_wait() };
    case "handoff":
      return {
        sentence: m.projects_task_handoff(),
        action: {
          label: m.projects_task_handoff_action(),
          link:
            task.resultsRoundId === null
              ? { to: "/projects/$projectId/rounds" }
              : { to: "/projects/$projectId/rounds/$roundId", roundId: task.resultsRoundId },
        },
      };
  }
}

const LINE = "flex flex-wrap items-center gap-x-3 gap-y-1 text-sm";

/** The closing date of a round, after its label. */
function Closes({ iso }: Readonly<{ iso: string }>) {
  return (
    <span className="text-muted-foreground">
      {m.projects_task_closes()}: <DateTime value={iso} />
    </span>
  );
}

/** The participant's one task for the current phase, with one main button (PR8, PR11). */
export function ParticipantTaskLine({
  projectId,
  overview,
}: Readonly<{ projectId: string; overview: ProjectOverview }>) {
  const view = taskView(participantTask(overview));
  return (
    <section aria-label={m.projects_task_heading()} className={LINE}>
      <p className="flex flex-wrap gap-x-2">
        <span className="font-medium">{view.sentence}</span>
        {view.done !== undefined && <span className="text-muted-foreground">{view.done}</span>}
        {view.closesAt !== undefined && <Closes iso={view.closesAt} />}
      </p>
      {view.action && (
        <ActionLink projectId={projectId} link={view.action.link}>
          {view.action.label}
        </ActionLink>
      )}
    </section>
  );
}

function elementCount(count: number): string {
  if (count === 0) return m.projects_status_elements_none();
  if (count === 1) return m.projects_status_elements_one();
  return m.projects_status_elements_many({ count });
}

function statusView(
  phase: ProjectPhase,
  status: FacilitatorStatus,
): { sentence: string; closesAt?: string; action: { label: string; link: TaskLink } } {
  switch (status.kind) {
    case "elements":
      return {
        sentence: elementCount(status.count),
        action:
          phase === "handoff"
            ? {
                label: m.projects_status_export_action(),
                link: { to: "/projects/$projectId/export" },
              }
            : {
                label: m.projects_status_board_action(),
                link: { to: "/projects/$projectId/board" },
              },
      };
    case "round": {
      const sentence = m.projects_status_round({
        number: status.number,
        completed: status.completed,
        raters: status.raters,
      });
      return {
        sentence:
          status.status === "awaiting_close"
            ? `${sentence}. ${m.projects_status_round_awaiting({ number: status.number })}`
            : sentence,
        ...(status.status === "awaiting_close" ? {} : { closesAt: status.closesAt }),
        action: {
          label: m.projects_status_round_action({ number: status.number }),
          link: { to: "/projects/$projectId/rounds/$roundId", roundId: status.roundId },
        },
      };
    }
    case "no_round":
      return {
        sentence: m.projects_status_no_round(),
        action: {
          label: m.projects_status_rounds_action(),
          link: { to: "/projects/$projectId/rounds" },
        },
      };
  }
}

/**
 * The facilitator's line: the status of the current phase with its main button, and the buttons
 * that move the project one phase on or back after a confirmation shown in the page (PR4).
 */
export function FacilitatorStatusLine({
  projectId,
  overview,
  move,
  onMoved,
}: Readonly<{
  projectId: string;
  overview: ProjectOverview;
  move: (direction: PhaseDirection) => Promise<Outcome<{ phase: ProjectPhase }>>;
  onMoved: () => Promise<void> | void;
}>) {
  const [asking, setAsking] = useState<PhaseDirection | null>(null);
  const [pending, setPending] = useState(false);
  const question = useRef<HTMLParagraphElement>(null);
  const triggers = useRef<Record<PhaseDirection, HTMLButtonElement | null>>({
    next: null,
    previous: null,
  });
  const next = adjacentPhase(overview.phase, "next");
  const previous = adjacentPhase(overview.phase, "previous");
  const target = asking === null ? null : adjacentPhase(overview.phase, asking);
  const view = statusView(overview.phase, facilitatorStatus(overview));

  function ask(direction: PhaseDirection) {
    setAsking(direction);
    requestAnimationFrame(() => question.current?.focus());
  }

  function cancel() {
    const direction = asking;
    setAsking(null);
    if (direction) requestAnimationFrame(() => triggers.current[direction]?.focus());
  }

  async function confirm(direction: PhaseDirection) {
    setPending(true);
    try {
      const outcome = await move(direction);
      if (outcome.ok) {
        toast.success(m.projects_phase_moved({ phase: projectPhaseLabel(outcome.value.phase) }));
        setAsking(null);
        await onMoved();
      } else {
        toast.error(refusalMessage(outcome.error));
      }
    } catch {
      toast.error(m.common_error_unexpected());
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <section aria-label={m.projects_status_heading()} className={LINE}>
        <p className="flex flex-wrap gap-x-2">
          <span className="font-medium">{view.sentence}</span>
          {view.closesAt !== undefined && <Closes iso={view.closesAt} />}
        </p>
        <ActionLink projectId={projectId} link={view.action.link}>
          {view.action.label}
        </ActionLink>
        {previous && (
          <Button
            ref={(node) => {
              triggers.current.previous = node;
            }}
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={asking === "previous"}
            onClick={() => ask("previous")}
          >
            <ArrowLeftIcon aria-hidden="true" data-icon="inline-start" />
            {m.projects_phase_move_previous({ phase: projectPhaseLabel(previous) })}
          </Button>
        )}
        {next && (
          <Button
            ref={(node) => {
              triggers.current.next = node;
            }}
            type="button"
            variant="outline"
            size="sm"
            aria-expanded={asking === "next"}
            onClick={() => ask("next")}
          >
            {m.projects_phase_move_next({ phase: projectPhaseLabel(next) })}
            <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
          </Button>
        )}
      </section>
      {asking && target && (
        <div className="flex basis-full flex-wrap items-center gap-3 border-t pt-2 text-sm">
          <p ref={question} tabIndex={-1} className="outline-none">
            {asking === "next"
              ? m.projects_phase_confirm_next({ phase: projectPhaseLabel(target) })
              : m.projects_phase_confirm_previous({ phase: projectPhaseLabel(target) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={pending}
              aria-busy={pending}
              onClick={() => void confirm(asking)}
            >
              {m.projects_phase_confirm({ phase: projectPhaseLabel(target) })}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={cancel}>
              {m.common_cancel()}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/** One line of the scope: the concept, cut to the width of the page. */
function ScopeLine({ concept }: Readonly<{ concept: string }>) {
  const text = concept.trim().replace(/\s+/g, " ");
  return (
    <p
      title={text === "" ? undefined : text}
      data-testid="project-scope-line"
      className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
    >
      {text === "" ? m.projects_header_no_scope() : text}
    </p>
  );
}

/**
 * The project header (PR11): the name as the page's `h1` with one line of the scope and the
 * steps beside it, then one bar with the task line, which gets the full width. It takes no more
 * height than the name, badges and tabs did.
 */
export function ProjectHeader({
  projectId,
  name,
  overview,
  move,
  onMoved,
}: Readonly<{
  projectId: string;
  name: string;
  overview: ProjectOverview;
  move: (direction: PhaseDirection) => Promise<Outcome<{ phase: ProjectPhase }>>;
  onMoved: () => Promise<void> | void;
}>) {
  return (
    <div className="mb-1.5 flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-1 basis-80 items-baseline gap-x-3">
          <h1 className="shrink-0 text-xl font-semibold tracking-tight">{name}</h1>
          <ScopeLine concept={overview.concept} />
        </div>
        <PhaseSteps phase={overview.phase} />
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-lg border bg-muted/50 px-3 py-1">
        {overview.role === "facilitator" ? (
          <FacilitatorStatusLine
            projectId={projectId}
            overview={overview}
            move={move}
            onMoved={onMoved}
          />
        ) : (
          <ParticipantTaskLine projectId={projectId} overview={overview} />
        )}
      </div>
    </div>
  );
}
