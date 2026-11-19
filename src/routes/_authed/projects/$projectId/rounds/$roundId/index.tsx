// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { VoteIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { projectTitle } from "@/components/projects/project-title";
import { ElementResultView } from "@/components/rounds/element-result";
import { toLocalInput, useTimeZone } from "@/components/rounds/format";
import { OpenRoundDialog } from "@/components/rounds/open-round-dialog";
import { PanelTable } from "@/components/rounds/panel-setup";
import { valueOrNotFound } from "@/components/rounds/result-value";
import { LocalDateTime, RoundStatusBadge } from "@/components/rounds/round-badges";
import { RoundForm, ruleSentences } from "@/components/rounds/round-form";
import { RatingsByParticipantTable, ResponseRateTable } from "@/components/rounds/round-tables";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { refusalMessage } from "@/lib/i18n/refusals";
import { closeRoundFn, openRoundFn, updateRoundFn } from "@/server/rounds/functions";
import type { RoundDetail } from "@/server/rounds/queries";
import {
  panelStatusQueryOptions,
  ratingsByParticipantQueryOptions,
  responseRateQueryOptions,
  roundBoardQueryOptions,
  roundKeys,
  roundQueryOptions,
  roundResultsQueryOptions,
} from "@/server/rounds/query-options";

/** One round: the setup of a draft, the progress of an open round, the results once closed. */
export const Route = createFileRoute("/_authed/projects/$projectId/rounds/$roundId/")({
  loader: async ({ context, params }) => {
    if (!z.uuid().safeParse(params.roundId).success) throw notFound();
    const { queryClient } = context;
    const { projectId, roundId } = params;
    const round = valueOrNotFound(
      await queryClient.ensureQueryData(roundQueryOptions(projectId, roundId)),
    );
    const isFacilitator = context.project.role === "facilitator";
    const loads: Promise<unknown>[] = [];
    if (isFacilitator && round.status === "draft") {
      loads.push(queryClient.ensureQueryData(roundBoardQueryOptions(projectId)));
      loads.push(queryClient.ensureQueryData(panelStatusQueryOptions(projectId)));
    }
    if (isFacilitator && round.status !== "draft") {
      loads.push(queryClient.ensureQueryData(responseRateQueryOptions(projectId, roundId)));
      if (round.facilitatorSeesRaters) {
        loads.push(
          queryClient.ensureQueryData(ratingsByParticipantQueryOptions(projectId, roundId)),
        );
      }
    }
    if (round.status === "closed") {
      loads.push(queryClient.ensureQueryData(roundResultsQueryOptions(projectId, roundId)));
    }
    await Promise.all(loads);
    return { number: round.number };
  },
  head: ({ match, loaderData }) => ({
    meta: [
      {
        title: projectTitle(
          match.context,
          loaderData ? m.rounds_round_name({ number: loaderData.number }) : m.rounds_title(),
        ),
      },
    ],
  }),
  component: RoundPage,
  notFoundComponent: () => <NotFoundState title={m.rounds_not_found_title()} />,
});

function RoundSummaryList({ round }: Readonly<{ round: RoundDetail }>) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_1fr]">
      <dt className="text-muted-foreground">{m.rounds_column_status()}</dt>
      <dd>
        <RoundStatusBadge status={round.status} />
      </dd>
      <dt className="text-muted-foreground">{m.rounds_column_closes()}</dt>
      <dd>
        <LocalDateTime iso={round.closesAt} />
      </dd>
      <dt className="text-muted-foreground">{m.rounds_summary_elements()}</dt>
      <dd>{round.elements.length}</dd>
      <dt className="text-muted-foreground">{m.rounds_summary_scale()}</dt>
      <dd>{m.rounds_band_range({ from: round.rule.scaleMin, to: round.rule.scaleMax })}</dd>
      <dt className="text-muted-foreground">{m.rounds_summary_rule()}</dt>
      <dd>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {ruleSentences(round.rule).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </dd>
      <dt className="text-muted-foreground">{m.rounds_summary_raters()}</dt>
      <dd>{round.facilitatorSeesRaters ? m.rounds_raters_visible() : m.rounds_raters_hidden()}</dd>
    </dl>
  );
}

function RoundPage() {
  const { projectId, roundId } = Route.useParams();
  const { project } = Route.useRouteContext();
  const { data } = useSuspenseQuery(roundQueryOptions(projectId, roundId));
  const round = valueOrNotFound(data);
  const isFacilitator = project.role === "facilitator";

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <PageHeader
          level={2}
          title={m.rounds_round_name({ number: round.number })}
          description={m.rounds_page_description()}
          actions={
            !isFacilitator &&
            round.status === "open" && (
              <Button asChild>
                <Link
                  to="/projects/$projectId/rounds/$roundId/rate"
                  params={{ projectId, roundId }}
                >
                  <VoteIcon aria-hidden="true" />
                  {m.rounds_rate_now({ number: round.number })}
                </Link>
              </Button>
            )
          }
        />
        <RoundSummaryList round={round} />
      </section>
      {round.snapshot && <OpeningSnapshot snapshot={round.snapshot} />}
      {isFacilitator && round.status === "draft" && <DraftSetup round={round} />}
      {isFacilitator && round.status !== "draft" && <RoundProgress round={round} />}
      {round.status === "closed" && <Results projectId={projectId} roundId={roundId} />}
      {round.status !== "closed" && round.status !== "draft" && (
        <p className="text-muted-foreground">{m.rounds_results_after_close()}</p>
      )}
    </div>
  );
}

function OpeningSnapshot({
  snapshot,
}: Readonly<{ snapshot: NonNullable<RoundDetail["snapshot"]> }>) {
  return (
    <section aria-labelledby="snapshot-heading" className="flex flex-col gap-3">
      <h3 id="snapshot-heading" className="text-lg font-semibold">
        {m.rounds_snapshot_heading()}
      </h3>
      <PanelTable
        joined={snapshot.panel}
        minimum={snapshot.minimum}
        caption={m.rounds_snapshot_caption()}
      />
      {snapshot.belowMinimumReason && (
        <div className="text-sm">
          <p className="font-medium">{m.rounds_snapshot_reason()}</p>
          <p className="whitespace-pre-line">{snapshot.belowMinimumReason}</p>
        </div>
      )}
    </section>
  );
}

function DraftSetup({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId } = Route.useParams();
  const { data: boardResult } = useSuspenseQuery(roundBoardQueryOptions(projectId));
  const { data: panelResult } = useSuspenseQuery(panelStatusQueryOptions(projectId));
  const board = valueOrNotFound(boardResult);
  const panel = valueOrNotFound(panelResult);
  const updateRound = useServerFn(updateRoundFn);
  const openRound = useServerFn(openRoundFn);
  const queryClient = useQueryClient();
  const timeZone = useTimeZone();
  const refreshProject = () =>
    queryClient.invalidateQueries({ queryKey: roundKeys.project(projectId) });

  return (
    <>
      <section aria-labelledby="setup-heading" className="flex max-w-3xl flex-col gap-4">
        <h3 id="setup-heading" className="text-lg font-semibold">
          {m.rounds_setup_heading()}
        </h3>
        <RoundForm
          key={`${timeZone}-${round.closesAt}-${round.elements.length}-${JSON.stringify(round.rule)}-${round.facilitatorSeesRaters}`}
          elements={board}
          initial={{
            elementIds: round.elements.map((element) => element.id),
            rule: round.rule,
            facilitatorSeesRaters: round.facilitatorSeesRaters,
            closesAt: toLocalInput(round.closesAt, timeZone),
          }}
          submitLabel={m.rounds_save_draft()}
          save={async (setup) => {
            const result = await updateRound({ data: { projectId, roundId: round.id, ...setup } });
            if (!result.ok) return result;
            return { ok: true };
          }}
          onSaved={async () => {
            await refreshProject();
            toast.success(m.rounds_draft_saved());
          }}
        />
      </section>
      <section aria-labelledby="open-heading" className="flex max-w-3xl flex-col gap-4">
        <h3 id="open-heading" className="text-lg font-semibold">
          {m.rounds_open_heading()}
        </h3>
        <p>{m.rounds_open_intro()}</p>
        <PanelTable
          joined={panel.joined}
          minimum={panel.minimum}
          caption={m.rounds_panel_caption()}
        />
        {panel.shortfall.length > 0 && (
          <Alert>
            <AlertDescription>{m.rounds_open_shortfall_hint()}</AlertDescription>
          </Alert>
        )}
        <div>
          <OpenRoundDialog
            number={round.number}
            open={(reason) =>
              openRound({
                data: {
                  projectId,
                  roundId: round.id,
                  ...(reason === undefined ? {} : { belowMinimumReason: reason }),
                },
              })
            }
            onOpened={async (status) => {
              await refreshProject();
              toast.success(
                status === "below_minimum"
                  ? m.rounds_opened_below_minimum({ number: round.number })
                  : m.rounds_opened({ number: round.number }),
              );
            }}
          />
        </div>
      </section>
    </>
  );
}

function CloseRound({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId } = Route.useParams();
  const closeRound = useServerFn(closeRoundFn);
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (round.status === "open") {
    return <p className="text-muted-foreground">{m.rounds_close_not_due()}</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      <p>{m.rounds_close_due()}</p>
      {error && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" className="self-start" disabled={busy} aria-busy={busy}>
            {m.rounds_close_button()}
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{m.rounds_close_title({ number: round.number })}</AlertDialogTitle>
            <AlertDialogDescription>{m.rounds_close_explained()}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{m.common_cancel()}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  const result = await closeRound({ data: { projectId, roundId: round.id } });
                  if (!result.ok) {
                    setError(refusalMessage(result.error));
                    return;
                  }
                  await queryClient.invalidateQueries({ queryKey: roundKeys.project(projectId) });
                  toast.success(m.rounds_closed({ number: round.number }));
                } catch {
                  setError(m.common_error_unexpected());
                } finally {
                  setBusy(false);
                }
              }}
            >
              {m.rounds_close_confirm()}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RoundProgress({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId, roundId } = Route.useParams();
  const { data } = useSuspenseQuery(responseRateQueryOptions(projectId, roundId));
  const rate = valueOrNotFound(data);
  return (
    <section aria-labelledby="progress-heading" className="flex flex-col gap-4">
      <h3 id="progress-heading" className="text-lg font-semibold">
        {m.rounds_progress_heading()}
      </h3>
      <ResponseRateTable rate={rate} />
      {round.status !== "closed" && <CloseRound round={round} />}
      {round.facilitatorSeesRaters && <ByParticipant round={round} />}
    </section>
  );
}

function ByParticipant({ round }: Readonly<{ round: RoundDetail }>) {
  const { projectId, roundId } = Route.useParams();
  const { data } = useSuspenseQuery(ratingsByParticipantQueryOptions(projectId, roundId));
  const participants = valueOrNotFound(data);
  return (
    <div className="flex flex-col gap-2">
      <h4 className="font-semibold">{m.rounds_by_participant_heading()}</h4>
      <RatingsByParticipantTable participants={participants} elements={round.elements} />
    </div>
  );
}

function Results({ projectId, roundId }: Readonly<{ projectId: string; roundId: string }>) {
  const { data } = useSuspenseQuery(roundResultsQueryOptions(projectId, roundId));
  const results = valueOrNotFound(data);
  return (
    <section aria-labelledby="results-heading" className="flex flex-col gap-4">
      <h3 id="results-heading" className="text-lg font-semibold">
        {m.rounds_results_heading()}
      </h3>
      <p className="text-muted-foreground">{m.rounds_results_intro()}</p>
      <div className="flex flex-col gap-4">
        {results.elements.map((element) => (
          <ElementResultView
            key={element.id}
            name={element.name}
            outcome={element.outcome}
            result={element.result}
            groups={element.groups}
            headingLevel={4}
          />
        ))}
      </div>
    </section>
  );
}
