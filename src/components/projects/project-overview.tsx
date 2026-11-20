// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The project overview (PR4, PR8, ADR 0013): the phases as a row of steps in text, one task card
// for a participant, and for the facilitator the status of the phase with the phase move.
import { Link } from "@tanstack/react-router";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  ChevronRightIcon,
  type LucideIcon,
} from "lucide-react";
import { type ReactNode, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { LocalDateTime } from "@/components/rounds/round-badges";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { projectPhaseLabel } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import {
  adjacentPhase,
  type PhaseDirection,
  type PhaseStepState,
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

const STEP_STATE: Record<PhaseStepState, () => string> = {
  done: () => m.projects_step_done(),
  current: () => m.projects_step_current(),
  next: () => m.projects_step_next(),
  later: () => m.projects_step_later(),
};

/** The four phases in order, each with its state in words; colour only adds to it (Q-ACC-2). */
export function PhaseSteps({ phase }: Readonly<{ phase: ProjectPhase }>) {
  return (
    <ol aria-label={m.projects_steps_label()} className="flex flex-wrap items-center gap-1 text-sm">
      {phaseSteps(phase).map((step, index) => (
        <li
          key={step.phase}
          aria-current={step.state === "current" ? "step" : undefined}
          className="flex items-center gap-1"
        >
          {index > 0 && (
            <ChevronRightIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          )}
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-1",
              step.state === "current" && "border-foreground font-semibold",
              step.state !== "current" && "border-transparent",
            )}
          >
            {step.state === "done" && <CheckIcon aria-hidden="true" className="size-4" />}
            {projectPhaseLabel(step.phase)}
            <span className="text-xs font-normal text-muted-foreground">
              ({STEP_STATE[step.state]()})
            </span>
          </span>
        </li>
      ))}
    </ol>
  );
}

type TaskLink =
  | { to: "/projects/$projectId/scope" | "/projects/$projectId/board" }
  | { to: "/projects/$projectId/rounds" }
  | { to: "/projects/$projectId/export" }
  | {
      to: "/projects/$projectId/rounds/$roundId/rate" | "/projects/$projectId/rounds/$roundId";
      roundId: string;
    };

function ActionLink({
  projectId,
  link,
  icon: Icon = ArrowRightIcon,
  variant = "default",
  children,
}: Readonly<{
  projectId: string;
  link: TaskLink;
  icon?: LucideIcon;
  variant?: "default" | "outline";
  children: ReactNode;
}>) {
  const params = "roundId" in link ? { projectId, roundId: link.roundId } : { projectId };
  return (
    <Button asChild variant={variant} className="self-start">
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
          link: { to: "/projects/$projectId/board" },
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

const CARD = "flex max-w-2xl flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground";

/** The participant's one task for the current phase, with one main button (PR8). */
export function ParticipantTaskCard({
  projectId,
  overview,
}: Readonly<{ projectId: string; overview: ProjectOverview }>) {
  const view = taskView(participantTask(overview));
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={CARD}>
      <h3 id={headingId} className="text-lg font-semibold">
        {m.projects_task_heading()}
      </h3>
      <p>{view.sentence}</p>
      {(view.done !== undefined || view.closesAt !== undefined) && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {view.done !== undefined && (
            <>
              <dt className="text-muted-foreground">{m.projects_task_done_label()}</dt>
              <dd>{view.done}</dd>
            </>
          )}
          {view.closesAt !== undefined && (
            <>
              <dt className="text-muted-foreground">{m.projects_task_closes()}</dt>
              <dd>
                <LocalDateTime iso={view.closesAt} />
              </dd>
            </>
          )}
        </dl>
      )}
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

function StatusLine({
  projectId,
  phase,
  status,
}: Readonly<{ projectId: string; phase: ProjectPhase; status: FacilitatorStatus }>) {
  switch (status.kind) {
    case "elements":
      return (
        <>
          <p>{elementCount(status.count)}</p>
          {phase === "handoff" ? (
            <ActionLink projectId={projectId} link={{ to: "/projects/$projectId/export" }}>
              {m.projects_status_export_action()}
            </ActionLink>
          ) : (
            <ActionLink projectId={projectId} link={{ to: "/projects/$projectId/board" }}>
              {m.projects_status_board_action()}
            </ActionLink>
          )}
        </>
      );
    case "round":
      return (
        <>
          <p>
            {m.projects_status_round({
              number: status.number,
              completed: status.completed,
              raters: status.raters,
            })}
          </p>
          {status.status === "awaiting_close" ? (
            <p className="text-sm">{m.projects_status_round_awaiting({ number: status.number })}</p>
          ) : (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 text-sm">
              <dt className="text-muted-foreground">{m.projects_task_closes()}</dt>
              <dd>
                <LocalDateTime iso={status.closesAt} />
              </dd>
            </dl>
          )}
          <ActionLink
            projectId={projectId}
            link={{ to: "/projects/$projectId/rounds/$roundId", roundId: status.roundId }}
          >
            {m.projects_status_round_action({ number: status.number })}
          </ActionLink>
        </>
      );
    case "no_round":
      return (
        <>
          <p>{m.projects_status_no_round()}</p>
          <ActionLink projectId={projectId} link={{ to: "/projects/$projectId/rounds" }}>
            {m.projects_status_rounds_action()}
          </ActionLink>
        </>
      );
  }
}

/**
 * The facilitator's view: the status of the current phase, and the buttons that move the
 * project one phase on or back after a confirmation shown in the page (PR4).
 */
export function FacilitatorPhasePanel({
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
  const statusId = useId();
  const controlsId = useId();
  const next = adjacentPhase(overview.phase, "next");
  const previous = adjacentPhase(overview.phase, "previous");
  const target = asking === null ? null : adjacentPhase(overview.phase, asking);

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
    <div className="flex max-w-2xl flex-col gap-4">
      <section aria-labelledby={statusId} className={CARD}>
        <h3 id={statusId} className="text-lg font-semibold">
          {m.projects_status_heading()}
        </h3>
        <StatusLine
          projectId={projectId}
          phase={overview.phase}
          status={facilitatorStatus(overview)}
        />
      </section>
      <section aria-labelledby={controlsId} className="flex flex-col gap-3">
        <h3 id={controlsId} className="text-base font-semibold">
          {m.projects_phase_controls_heading()}
        </h3>
        <div className="flex flex-wrap gap-2">
          {previous && (
            <Button
              ref={(node) => {
                triggers.current.previous = node;
              }}
              type="button"
              variant="outline"
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
              aria-expanded={asking === "next"}
              onClick={() => ask("next")}
            >
              {m.projects_phase_move_next({ phase: projectPhaseLabel(next) })}
              <ArrowRightIcon aria-hidden="true" data-icon="inline-end" />
            </Button>
          )}
        </div>
        {asking && target && (
          <div className="flex flex-col gap-3 rounded-lg border border-foreground p-4">
            <p ref={question} tabIndex={-1} className="outline-none">
              {asking === "next"
                ? m.projects_phase_confirm_next({ phase: projectPhaseLabel(target) })
                : m.projects_phase_confirm_previous({ phase: projectPhaseLabel(target) })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                disabled={pending}
                aria-busy={pending}
                onClick={() => void confirm(asking)}
              >
                {m.projects_phase_confirm({ phase: projectPhaseLabel(target) })}
              </Button>
              <Button type="button" variant="outline" onClick={cancel}>
                {m.common_cancel()}
              </Button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
