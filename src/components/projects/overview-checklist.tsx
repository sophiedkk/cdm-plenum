// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The facilitator's Overview (PR4, PR10, ADR 0019): the checklist of the current phase, each item
// with a check when done and at most one outline action, then the one main button that moves the
// project on and a quiet link that moves it back. Both moves ask first in the page; the
// confirmation opens below the buttons, so nothing moves under the pointer.
import { Link } from "@tanstack/react-router";
import { CheckIcon, CircleIcon, SendIcon } from "lucide-react";
import { type ReactNode, type Ref, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { DateTime } from "@/components/status/date-time";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import type { Outcome } from "@/lib/forms/outcome";
import { projectPhaseLabel } from "@/lib/i18n/labels";
import { refusalMessage } from "@/lib/i18n/refusals";
import { type ChecklistItem, checklist, type OverviewFacts } from "@/lib/project-home";
import { adjacentPhase, type PhaseDirection, type ProjectPhase } from "@/lib/project-phases";

function ItemLink({
  to,
  projectId,
  search,
  roundId,
  hash,
  children,
}: Readonly<{
  to:
    | "/projects/$projectId/scope"
    | "/projects/$projectId/members"
    | "/projects/$projectId/board"
    | "/projects/$projectId/brainstorm"
    | "/projects/$projectId/models"
    | "/projects/$projectId/rounds/new"
    | "/projects/$projectId/rounds/$roundId";
  projectId: string;
  search?: { duplicates?: true; ckm?: true };
  roundId?: string;
  hash?: string;
  children: ReactNode;
}>) {
  return (
    <Button asChild variant="outline" size="sm">
      <Link
        to={to}
        params={roundId === undefined ? { projectId } : { projectId, roundId }}
        {...(search === undefined ? {} : { search })}
        {...(hash === undefined ? {} : { hash })}
      >
        {children}
      </Link>
    </Button>
  );
}

/** A reminder to every participant who has not added an element yet (EL13). */
function RemindButton({ remind }: Readonly<{ remind: () => Promise<Outcome<{ sent: number }>> }>) {
  const [pending, setPending] = useState(false);
  async function send() {
    setPending(true);
    try {
      const outcome = await remind();
      if (outcome.ok) {
        toast.success(
          outcome.value.sent === 1
            ? m.projects_check_reminded_one()
            : m.projects_check_reminded_many({ count: outcome.value.sent }),
        );
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
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={pending}
      aria-busy={pending}
      onClick={() => void send()}
    >
      <SendIcon aria-hidden="true" data-icon="inline-start" />
      {m.projects_check_remind()}
    </Button>
  );
}

interface ItemView {
  text: ReactNode;
  action?: ReactNode;
}

function count(one: () => string, many: (input: { count: number }) => string, value: number) {
  return value === 1 ? one() : many({ count: value });
}

/** A discover part: its name in bold, then where it stands (ADR 0020 prototype). */
function part(title: string, detail: ReactNode): ReactNode {
  return (
    <>
      <strong className="font-semibold">{title}</strong> {detail}
    </>
  );
}

function itemView(
  item: ChecklistItem,
  projectId: string,
  slots: {
    reveal?: ReactNode | undefined;
    remind?: (() => Promise<Outcome<{ sent: number }>>) | undefined;
  },
): ItemView {
  const invite = (
    <ItemLink to="/projects/$projectId/members" projectId={projectId}>
      {m.projects_check_invite()}
    </ItemLink>
  );
  switch (item.key) {
    case "scope_written":
      return item.done
        ? { text: m.projects_check_scope_written() }
        : {
            text: m.projects_check_scope_write(),
            action: (
              <ItemLink to="/projects/$projectId/scope" projectId={projectId}>
                {m.projects_check_scope_action()}
              </ItemLink>
            ),
          };
    case "panel":
      return item.done
        ? { text: m.projects_check_panel_done() }
        : {
            text: count(m.projects_check_panel_one, m.projects_check_panel_many, item.missing),
            action: invite,
          };
    case "scope_comments":
      return item.count === 0
        ? { text: m.projects_check_comments_none() }
        : {
            text: count(m.projects_check_comments_one, m.projects_check_comments_many, item.count),
            action: (
              <ItemLink to="/projects/$projectId/scope" projectId={projectId} hash="scope-comments">
                {m.projects_check_comments_action()}
              </ItemLink>
            ),
          };
    case "models":
      return {
        text: part(
          m.projects_check_models_title(),
          item.done
            ? item.models === 1
              ? m.projects_check_models_one({ elements: item.elements })
              : m.projects_check_models_many({ models: item.models, elements: item.elements })
            : m.projects_check_models_none(),
        ),
        action: (
          <ItemLink to="/projects/$projectId/models" projectId={projectId}>
            {item.done ? m.projects_check_models_review() : m.projects_check_models_start()}
          </ItemLink>
        ),
      };
    case "first_look":
      if (item.participants === 0)
        return {
          text: part(m.projects_check_first_look_title(), m.projects_check_no_participants()),
          action: invite,
        };
      return {
        text: part(
          m.projects_check_first_look_title(),
          item.total === 0
            ? m.projects_check_first_look_empty()
            : m.projects_check_first_look({
                finished: item.finished,
                participants: item.participants,
              }),
        ),
        action: item.remind && slots.remind ? <RemindButton remind={slots.remind} /> : undefined,
      };
    case "contributions":
      return {
        text: part(
          m.projects_check_add_title(),
          m.projects_check_contributions({
            contributors: item.contributors,
            participants: item.participants,
          }),
        ),
        action: (
          <ItemLink to="/projects/$projectId/brainstorm" projectId={projectId}>
            {m.projects_check_add_action()}
          </ItemLink>
        ),
      };
    case "cleanup":
      if (item.revealed === false)
        return {
          text: part(m.projects_check_cleanup_title(), m.projects_check_reveal()),
          action: slots.reveal,
        };
      return item.duplicates === 0
        ? { text: part(m.projects_check_cleanup_title(), m.projects_check_duplicates_none()) }
        : {
            text: part(
              m.projects_check_cleanup_title(),
              count(
                m.projects_check_duplicates_one,
                m.projects_check_duplicates_many,
                item.duplicates,
              ),
            ),
            action: (
              <ItemLink
                to="/projects/$projectId/board"
                projectId={projectId}
                search={{ duplicates: true }}
              >
                {m.projects_check_duplicates_action()}
              </ItemLink>
            ),
          };
    case "round":
      return roundView(item, projectId);
    case "undecided":
      if (item.done) return { text: m.projects_check_undecided_none() };
      return item.count === 0
        ? { text: m.projects_check_no_elements() }
        : {
            text: count(
              m.projects_check_undecided_one,
              m.projects_check_undecided_many,
              item.count,
            ),
          };
  }
}

function roundView(item: Extract<ChecklistItem, { key: "round" }>, projectId: string): ItemView {
  const round = item.round;
  if (round === null) {
    const number = (item.closed?.number ?? 0) + 1;
    return {
      text: m.projects_check_round_set_up({ number }),
      action: (
        <ItemLink to="/projects/$projectId/rounds/new" projectId={projectId}>
          {m.rounds_new()}
        </ItemLink>
      ),
    };
  }
  const go = (label: string) => (
    <ItemLink to="/projects/$projectId/rounds/$roundId" projectId={projectId} roundId={round.id}>
      {label}
    </ItemLink>
  );
  switch (round.status) {
    case "draft":
      return {
        text: m.projects_check_round_draft({ number: round.number }),
        action: go(m.projects_check_round_open({ number: round.number })),
      };
    case "open":
      return {
        text: (
          <>
            {m.projects_check_round_running({
              number: round.number,
              completed: round.completed,
              raters: round.raters,
            })}{" "}
            <span className="text-muted-foreground">
              {m.projects_check_round_closes()} <DateTime value={round.closesAt} />
            </span>
          </>
        ),
        action: go(m.projects_check_round_go({ number: round.number })),
      };
    case "awaiting_close":
      return {
        text: m.projects_check_round_due({ number: round.number }),
        action: go(m.projects_check_round_close({ number: round.number })),
      };
  }
}

/** The state icon of an item, with its state in words for a screen reader. */
function ItemState({ done }: Readonly<{ done: boolean | null }>) {
  if (done === null) return <span aria-hidden="true" className="size-6" />;
  return done ? (
    <span className="inline-flex size-6 items-center justify-center rounded-full bg-success/10 text-success">
      <CheckIcon aria-hidden="true" className="size-4" />
      <span className="sr-only">{m.projects_check_done()}</span>
    </span>
  ) : (
    <span className="inline-flex size-6 items-center justify-center text-muted-foreground">
      <CircleIcon aria-hidden="true" className="size-4" />
      <span className="sr-only">{m.projects_check_todo()}</span>
    </span>
  );
}

export function Checklist({
  projectId,
  items,
  reveal,
  remind,
}: Readonly<{
  projectId: string;
  items: readonly ChecklistItem[];
  reveal?: ReactNode | undefined;
  remind?: (() => Promise<Outcome<{ sent: number }>>) | undefined;
}>) {
  return (
    <ul className="border-t">
      {items.map((item) => {
        const view = itemView(item, projectId, { reveal, remind });
        return (
          <li
            key={item.key}
            data-item={item.key}
            className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 border-b py-4 sm:grid-cols-[auto_1fr_auto]"
          >
            <ItemState done={item.done} />
            <span className={item.done ? "text-muted-foreground" : undefined}>{view.text}</span>
            {view.action && (
              <span className="col-start-2 justify-self-start sm:col-start-3">{view.action}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** The confirmation of a phase move, shown in the page below the move buttons. */
function MoveConfirm({
  direction,
  target,
  pending,
  questionRef,
  onConfirm,
  onCancel,
}: Readonly<{
  direction: PhaseDirection;
  target: ProjectPhase;
  pending: boolean;
  questionRef: Ref<HTMLParagraphElement>;
  onConfirm: () => void;
  onCancel: () => void;
}>) {
  const label = useId();
  const phase = projectPhaseLabel(target);
  return (
    <fieldset
      aria-labelledby={label}
      className="mt-4 flex min-w-0 flex-col gap-4 rounded-lg border bg-muted p-4"
    >
      <p id={label} ref={questionRef} tabIndex={-1} className="outline-none">
        {direction === "next"
          ? m.projects_phase_confirm_next({ phase })
          : m.projects_phase_confirm_previous({ phase })}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant={direction === "next" ? "default" : "outline"}
          disabled={pending}
          aria-busy={pending}
          onClick={onConfirm}
        >
          {m.projects_phase_confirm({ phase })}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {m.common_cancel()}
        </Button>
      </div>
    </fieldset>
  );
}

/**
 * The phase move (PR4): one main button on to the next phase and a text link back, each with
 * its own confirmation. A refusal, such as a round still open (PR10), shows as a toast.
 */
export function PhaseMove({
  phase,
  move,
  onMoved,
}: Readonly<{
  phase: ProjectPhase;
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
  const next = adjacentPhase(phase, "next");
  const previous = adjacentPhase(phase, "previous");
  const target = asking === null ? null : adjacentPhase(phase, asking);

  function ask(direction: PhaseDirection) {
    if (asking === direction) {
      setAsking(null);
      return;
    }
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
    <div className="mt-8">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        {next && (
          <Button
            ref={(node) => {
              triggers.current.next = node;
            }}
            type="button"
            size="lg"
            aria-expanded={asking === "next"}
            onClick={() => ask("next")}
          >
            {m.projects_phase_move_next({ phase: projectPhaseLabel(next) })}
          </Button>
        )}
        {previous && (
          <Button
            ref={(node) => {
              triggers.current.previous = node;
            }}
            type="button"
            variant="link"
            aria-expanded={asking === "previous"}
            onClick={() => ask("previous")}
            className="h-auto px-0 text-muted-foreground"
          >
            {m.projects_phase_move_previous({ phase: projectPhaseLabel(previous) })}
          </Button>
        )}
      </div>
      {asking && target && (
        <MoveConfirm
          direction={asking}
          target={target}
          pending={pending}
          questionRef={question}
          onConfirm={() => void confirm(asking)}
          onCancel={cancel}
        />
      )}
    </div>
  );
}

/** The Overview of the facilitator: the checklist of the phase, or the export in hand-off. */
export function OverviewChecklist({
  projectId,
  phase,
  facts,
  reveal,
  remind,
  move,
  onMoved,
}: Readonly<{
  projectId: string;
  phase: ProjectPhase;
  facts: OverviewFacts;
  reveal?: ReactNode | undefined;
  remind?: (() => Promise<Outcome<{ sent: number }>>) | undefined;
  move: (direction: PhaseDirection) => Promise<Outcome<{ phase: ProjectPhase }>>;
  onMoved: () => Promise<void> | void;
}>) {
  const next = adjacentPhase(phase, "next");
  const items = checklist(phase, facts);
  return (
    <section aria-labelledby="overview-heading" className="flex flex-col gap-4">
      <h2 id="overview-heading" className="text-lg font-semibold">
        {next
          ? m.projects_overview_before({ phase: projectPhaseLabel(next) })
          : m.projects_overview_export()}
      </h2>
      {next ? (
        <Checklist projectId={projectId} items={items} reveal={reveal} remind={remind} />
      ) : (
        <div>
          <Button asChild size="lg">
            <Link to="/projects/$projectId/export" params={{ projectId }}>
              {m.projects_overview_export_action()}
            </Link>
          </Button>
        </div>
      )}
      <PhaseMove phase={phase} move={move} onMoved={onMoved} />
    </section>
  );
}
