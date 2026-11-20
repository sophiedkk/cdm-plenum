// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// The participant's "Your turn" card on the project home (PR8, ADR 0019): what to do now as the
// heading, its facts and one main button. When nothing waits, one short line takes its place.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { DateTime } from "@/components/status/date-time";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { type ParticipantTask, type ProjectOverview, participantTask } from "@/lib/project-tasks";

function Facts({ facts }: Readonly<{ facts: { term: string; value: ReactNode }[] }>) {
  return (
    <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1">
      {facts.map((fact) => (
        <div key={fact.term} className="flex flex-col">
          <dt className="text-sm text-muted-foreground">{fact.term}</dt>
          <dd>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const CARD = "rounded-lg border bg-card p-4 text-card-foreground shadow-xs sm:p-6";
const HEADING = "text-2xl font-semibold tracking-tight sm:text-3xl";

/** The card for a task that asks something; the line for one that does not. */
export function TaskCard({
  projectId,
  overview,
}: Readonly<{ projectId: string; overview: ProjectOverview }>) {
  const task = participantTask(overview);
  switch (task.kind) {
    case "scope":
      return (
        <section aria-labelledby="task-heading" className={CARD}>
          <h2 id="task-heading" className={HEADING}>
            {m.projects_home_turn_scope()}
          </h2>
          <Button asChild size="lg" className="mt-6">
            <Link to="/projects/$projectId/scope" params={{ projectId }}>
              {m.projects_task_scope_action()}
            </Link>
          </Button>
        </section>
      );
    case "discover":
      // NOTE: ADR 0020. The first look at existing models comes before adding what is missing.
      if (task.firstLook.answered < task.firstLook.total)
        return (
          <section aria-labelledby="task-heading" className={CARD}>
            <h2 id="task-heading" className={HEADING}>
              {m.projects_home_turn_first_look()}
            </h2>
            <Facts
              facts={[
                { term: m.projects_home_fact_to_look_at(), value: task.firstLook.total },
                { term: m.projects_home_fact_looked_at(), value: task.firstLook.answered },
              ]}
            />
            <Button asChild size="lg" className="mt-6">
              <Link to="/projects/$projectId/first-look" params={{ projectId }}>
                {task.firstLook.answered === 0
                  ? m.projects_task_first_look_action()
                  : m.projects_task_first_look_continue()}
              </Link>
            </Button>
          </section>
        );
      return (
        <section aria-labelledby="task-heading" className={CARD}>
          <h2 id="task-heading" className={HEADING}>
            {m.projects_home_turn_discover()}
          </h2>
          <Facts facts={[{ term: m.projects_home_fact_added(), value: task.added }]} />
          <Button asChild size="lg" className="mt-6">
            <Link to="/projects/$projectId/brainstorm" params={{ projectId }}>
              {m.projects_task_discover_action()}
            </Link>
          </Button>
        </section>
      );
    case "rate":
      return <RateCard projectId={projectId} task={task} />;
    default:
      return <TaskLine projectId={projectId} task={task} />;
  }
}

function RateCard({
  projectId,
  task,
}: Readonly<{ projectId: string; task: Extract<ParticipantTask, { kind: "rate" }> }>) {
  return (
    <section aria-labelledby="task-heading" className={CARD}>
      <h2 id="task-heading" className={HEADING}>
        {m.projects_home_turn_rate({ number: task.number })}
      </h2>
      <Facts
        facts={[
          { term: m.projects_home_fact_elements(), value: task.total },
          { term: m.projects_home_fact_closes(), value: <DateTime value={task.closesAt} /> },
          { term: m.projects_home_fact_rated(), value: task.rated },
        ]}
      />
      <Button asChild size="lg" className="mt-6">
        <Link
          to="/projects/$projectId/rounds/$roundId/rate"
          params={{ projectId, roundId: task.roundId }}
        >
          {task.rated === 0 ? m.projects_home_rate_start() : m.projects_home_rate_continue()}
        </Link>
      </Button>
    </section>
  );
}

/** A task that asks nothing now, as one line; a round rated in full keeps a way back to it. */
function TaskLine({
  projectId,
  task,
}: Readonly<{
  projectId: string;
  task: Exclude<ParticipantTask, { kind: "scope" | "discover" | "rate" }>;
}>) {
  switch (task.kind) {
    case "rated_all":
      return (
        <p data-testid="task-line">
          {m.projects_task_rated_all({ number: task.number })} {m.projects_home_change_until()}{" "}
          <DateTime value={task.closesAt} />.{" "}
          <Link
            to="/projects/$projectId/rounds/$roundId/rate"
            params={{ projectId, roundId: task.roundId }}
            search={{ card: "overview" }}
            className="underline underline-offset-4"
          >
            {m.projects_task_rated_all_action()}
          </Link>
        </p>
      );
    case "round_closing":
      return (
        <p data-testid="task-line">{m.projects_task_round_closing({ number: task.number })}</p>
      );
    case "wait":
      return <p data-testid="task-line">{m.projects_task_wait()}</p>;
    case "handoff":
      return <p data-testid="task-line">{m.projects_task_handoff()}</p>;
  }
}
