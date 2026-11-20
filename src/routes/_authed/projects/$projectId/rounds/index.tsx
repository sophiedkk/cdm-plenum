// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PlusIcon, VoteIcon } from "lucide-react";
import { projectTitle } from "@/components/projects/project-title";
import { valueOrNotFound } from "@/components/rounds/result-value";
import { RoundStatusBadge } from "@/components/rounds/round-badges";
import { EmptyState, PageHeader } from "@/components/shell/route-states";
import { DateTime } from "@/components/status/date-time";
import { Button } from "@/components/ui/button";
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
import { mayRate } from "@/lib/project-roles";
import { projectQueryOptions } from "@/server/projects/query-options";
import { roundsQueryOptions } from "@/server/rounds/query-options";
import type { RoundSummary } from "@/server/rounds/round";

/** The rounds of the project with their state (DE1); the panel settings are on Settings (PR12). */
export const Route = createFileRoute("/_authed/projects/$projectId/rounds/")({
  loader: async ({ context, params }) => {
    valueOrNotFound(
      await context.queryClient.ensureQueryData(roundsQueryOptions(params.projectId)),
    );
  },
  head: ({ match }) => ({ meta: [{ title: projectTitle(match.context, m.rounds_title()) }] }),
  component: Rounds,
});

const LINK = "font-medium underline underline-offset-4 hover:decoration-2";

function RoundAction({
  round,
  projectId,
  canRate,
}: Readonly<{ round: RoundSummary; projectId: string; canRate: boolean }>) {
  const params = { projectId, roundId: round.id };
  // A plain link: the header's task line carries the main button to rate (PR11).
  if (round.status === "open" && canRate) {
    return (
      <Link to="/projects/$projectId/rounds/$roundId/rate" params={params} className={LINK}>
        {m.rounds_rate_now({ number: round.number })}
      </Link>
    );
  }
  if (round.status === "closed") {
    return (
      <Link to="/projects/$projectId/rounds/$roundId" params={params} className={LINK}>
        {m.rounds_view_results({ number: round.number })}
      </Link>
    );
  }
  return null;
}

function Rounds() {
  const { projectId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const isFacilitator = project.role === "facilitator";
  const { data: detail } = useSuspenseQuery(projectQueryOptions(projectId));
  // DE14: a facilitator rates once they joined a stakeholder group on the members page.
  const canRate = detail.ok && mayRate(detail.value.role, detail.value.ownGroupId);
  const { data } = useSuspenseQuery(roundsQueryOptions(projectId));
  const rounds = valueOrNotFound(data);
  const mayStart = isFacilitator && rounds.every((round) => round.status === "closed");
  const unfinished = rounds.find((round) => round.status !== "closed");

  const newRound = mayStart && (
    <Button asChild>
      <Link to="/projects/$projectId/rounds/new" params={{ projectId }}>
        <PlusIcon aria-hidden="true" />
        {m.rounds_new()}
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <PageHeader
          level={2}
          title={m.rounds_title()}
          description={m.rounds_purpose()}
          actions={rounds.length > 0 && newRound}
        />
        {isFacilitator && unfinished && (
          <p className="text-sm text-muted-foreground">
            {m.rounds_one_at_a_time({ number: unfinished.number })}
          </p>
        )}
        {!canRate && unfinished?.status === "open" && (
          <p className="text-sm text-muted-foreground">
            {m.rounds_rate_join_group()}{" "}
            <Link
              to="/projects/$projectId/settings"
              params={{ projectId }}
              className="underline underline-offset-4"
            >
              {m.rounds_rate_settings_link()}
            </Link>
          </p>
        )}
        {rounds.length === 0 ? (
          <EmptyState
            icon={<VoteIcon aria-hidden="true" />}
            title={m.rounds_empty_title()}
            description={
              isFacilitator ? m.rounds_empty_facilitator() : m.rounds_empty_participant()
            }
          >
            {newRound}
          </EmptyState>
        ) : (
          <Table>
            <TableCaption className="sr-only">{m.rounds_table_caption()}</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">{m.rounds_column_round()}</TableHead>
                <TableHead scope="col">{m.rounds_column_status()}</TableHead>
                <TableHead scope="col">{m.rounds_column_closes()}</TableHead>
                <TableHead scope="col">
                  <span className="sr-only">{m.rounds_column_action()}</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rounds.map((round) => (
                <TableRow key={round.id}>
                  <TableCell>
                    <Link
                      to="/projects/$projectId/rounds/$roundId"
                      params={{ projectId, roundId: round.id }}
                      className={LINK}
                    >
                      {m.rounds_round_name({ number: round.number })}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <RoundStatusBadge status={round.status} />
                  </TableCell>
                  <TableCell>
                    <DateTime value={round.closesAt} />
                  </TableCell>
                  <TableCell>
                    <RoundAction round={round} projectId={projectId} canRate={canRate} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
