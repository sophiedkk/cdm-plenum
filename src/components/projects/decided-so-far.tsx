// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

// "Decided so far" on the participant's project home (PR8, ADR 0019): one bar split into the
// elements in the model, not in it, still open and not rated yet, then a row per status with its
// count and the elements as small labels. Each element counts once, by the outcome of the newest
// closed round that rated it.
import { Link } from "@tanstack/react-router";
import { CheckIcon, CircleDashedIcon, CircleIcon, type LucideIcon, XIcon } from "lucide-react";
import { m } from "@/i18n/messages";
import { type DecidedSoFar, type DecidedStatus, decidedGroups } from "@/lib/project-home";
import { cn } from "@/lib/utils";

const STATUS: Record<
  DecidedStatus,
  { label: () => string; icon: LucideIcon; text: string; bar: string }
> = {
  included: {
    label: m.projects_decided_included,
    icon: CheckIcon,
    text: "border-success/30 bg-success/10 text-success",
    bar: "bg-success",
  },
  excluded: {
    label: m.projects_decided_excluded,
    icon: XIcon,
    text: "border-destructive/30 bg-destructive/10 text-destructive",
    bar: "bg-destructive",
  },
  no_consensus: {
    label: m.projects_decided_open,
    icon: CircleDashedIcon,
    text: "border-warning/30 bg-warning/10 text-warning",
    bar: "bg-warning",
  },
  not_rated: {
    label: m.projects_decided_not_rated,
    icon: CircleIcon,
    text: "border-border bg-muted text-muted-foreground",
    bar: "bg-muted-foreground/40",
  },
};

export function DecidedSoFarSection({
  projectId,
  decided,
}: Readonly<{ projectId: string; decided: DecidedSoFar }>) {
  const groups = decidedGroups(decided.elements);
  const count = (status: DecidedStatus) =>
    groups.find((group) => group.status === status)?.elements.length ?? 0;
  const closed = decided.lastClosedRound;
  return (
    <section aria-labelledby="decided-heading" className="mt-12 flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 id="decided-heading" className="text-lg font-semibold">
          {m.projects_decided_title()}
        </h2>
        {closed && (
          <Link
            to="/projects/$projectId/rounds/$roundId"
            params={{ projectId, roundId: closed.id }}
            className="text-sm underline underline-offset-4"
          >
            {m.projects_decided_results({ number: closed.number })}
          </Link>
        )}
      </div>
      {groups.length === 0 ? (
        <p className="text-muted-foreground">{m.projects_decided_empty()}</p>
      ) : (
        <>
          <div
            role="img"
            aria-label={m.projects_decided_bar({
              included: count("included"),
              excluded: count("excluded"),
              open: count("no_consensus"),
              unrated: count("not_rated"),
            })}
            className="flex h-3 gap-0.5 overflow-hidden rounded-full"
          >
            {groups.map((group) => (
              <span
                key={group.status}
                data-status={group.status}
                className={STATUS[group.status].bar}
                style={{ flexGrow: group.elements.length }}
              />
            ))}
          </div>
          <div className="flex flex-col">
            {groups.map((group, index) => {
              const status = STATUS[group.status];
              const Icon = status.icon;
              return (
                <section
                  key={group.status}
                  aria-labelledby={`decided-${group.status}`}
                  className={cn(
                    "grid gap-x-4 gap-y-2 py-3 sm:grid-cols-[12rem_1fr]",
                    index > 0 && "border-t",
                  )}
                >
                  <h3
                    id={`decided-${group.status}`}
                    className={cn(
                      "inline-flex items-center gap-1.5 self-start justify-self-start rounded-md border px-2 py-0.5 text-sm font-semibold",
                      status.text,
                    )}
                  >
                    <Icon aria-hidden="true" className="size-4" />
                    {status.label()} <span className="tabular-nums">{group.elements.length}</span>
                  </h3>
                  <ul className="flex flex-wrap gap-1.5">
                    {group.elements.map((element) => (
                      <li
                        key={element.id}
                        className="rounded-full border bg-card px-2.5 py-0.5 text-sm break-words"
                      >
                        {element.name}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
