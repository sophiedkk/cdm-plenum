// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { EyeIcon, EyeOffIcon } from "lucide-react";
import { z } from "zod";
import { projectTitle } from "@/components/projects/project-title";
import { RatingElement } from "@/components/rounds/rating-element";
import { valueOrNotFound } from "@/components/rounds/result-value";
import { LocalDateTime, RoundStatusBadge } from "@/components/rounds/round-badges";
import { NotFoundState } from "@/components/shell/route-states";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { m } from "@/i18n/messages";
import { dataTypeByKey } from "@/lib/data-types";
import { mayRate } from "@/lib/project-roles";
import { projectQueryOptions } from "@/server/projects/query-options";
import { clearRatingFn, saveRatingFn } from "@/server/rounds/functions";
import { myRatingsQueryOptions, roundBoardQueryOptions } from "@/server/rounds/query-options";
import type { MyRatings, OwnRating } from "@/server/rounds/ratings";

/**
 * The rating screen of an open round (DE3, DE4, DE7, DE8), for participants and for a
 * facilitator who joined a stakeholder group (DE14). A facilitator without a group sees the
 * elements read-only and where to join one.
 */
export const Route = createFileRoute("/_authed/projects/$projectId/rounds/$roundId/rate")({
  loader: async ({ context, params }) => {
    if (!z.uuid().safeParse(params.roundId).success) throw notFound();
    const { queryClient } = context;
    const [mine] = await Promise.all([
      queryClient.ensureQueryData(myRatingsQueryOptions(params.projectId, params.roundId)),
      queryClient.ensureQueryData(roundBoardQueryOptions(params.projectId)),
    ]);
    return { number: valueOrNotFound(mine).round.number };
  },
  head: ({ match, loaderData }) => ({
    meta: [
      {
        title: projectTitle(
          match.context,
          loaderData ? m.rounds_rate_title({ number: loaderData.number }) : m.rounds_title(),
        ),
      },
    ],
  }),
  component: RatePage,
  notFoundComponent: () => <NotFoundState title={m.rounds_not_found_title()} />,
});

function RatePage() {
  const { projectId, roundId } = Route.useParams();
  const { data } = useSuspenseQuery(myRatingsQueryOptions(projectId, roundId));
  const { data: boardResult } = useSuspenseQuery(roundBoardQueryOptions(projectId));
  const { data: detail } = useSuspenseQuery(projectQueryOptions(projectId));
  const canRate = detail.ok && mayRate(detail.value.role, detail.value.ownGroupId);
  const mine = valueOrNotFound(data);
  const board = valueOrNotFound(boardResult);
  const saveRating = useServerFn(saveRatingFn);
  const clearRating = useServerFn(clearRatingFn);
  const queryClient = useQueryClient();
  const { round, elements } = mine;
  const editable = round.status === "open" && canRate;
  const rated = elements.filter((element) => element.own.rated).length;
  const dataTypes = new Map(board.map((element) => [element.id, element.dataType]));
  const queryKey = myRatingsQueryOptions(projectId, roundId).queryKey;

  /** Keeps the cached ratings in step with a save, so the progress counts it at once. */
  const remember = (elementId: string, own: OwnRating) => {
    queryClient.setQueryData(queryKey, (old) => {
      if (!old?.ok) return old;
      const value: MyRatings = {
        ...old.value,
        elements: old.value.elements.map((element) =>
          element.id === elementId ? { ...element, own } : element,
        ),
      };
      return { ...old, value };
    });
  };

  return (
    <div className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">{m.rounds_rate_title({ number: round.number })}</h2>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <RoundStatusBadge status={round.status} />
          <span>
            {m.rounds_closes_at_short()} <LocalDateTime iso={round.closesAt} />
          </span>
        </p>
        <p className="font-medium">{m.rounds_rate_question()}</p>
        <p className="text-sm text-muted-foreground">
          {m.rounds_rate_intro()}{" "}
          {m.rounds_rate_bands({
            bottomFrom: round.rule.scaleMin,
            bottomTo: round.rule.bottomBandMax,
            topFrom: round.rule.topBandMin,
            topTo: round.rule.scaleMax,
          })}
        </p>
        <p className="flex items-start gap-2 text-sm">
          {round.facilitatorSeesRaters ? (
            <EyeIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <EyeOffIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          <span>
            <strong className="font-medium">
              {round.facilitatorSeesRaters
                ? m.rounds_rate_visible_title()
                : m.rounds_rate_hidden_title()}
            </strong>
            {". "}
            {round.facilitatorSeesRaters ? m.rounds_raters_visible() : m.rounds_raters_hidden()}
          </span>
        </p>
      </div>
      {!canRate && (
        <Alert>
          <AlertTitle>{m.rounds_rate_no_group_title()}</AlertTitle>
          <AlertDescription>
            <p>
              {m.rounds_rate_no_group()}{" "}
              <Link
                to="/projects/$projectId/members"
                params={{ projectId }}
                className="underline underline-offset-4"
              >
                {m.rounds_rate_members_link()}
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      )}
      {round.status !== "open" && (
        <Alert>
          <AlertDescription>{m.rounds_rate_not_open()}</AlertDescription>
        </Alert>
      )}
      <p className="font-medium">{m.rounds_rate_progress({ rated, total: elements.length })}</p>
      <div className="flex flex-col gap-4">
        {elements.map((element) => {
          const key = dataTypes.get(element.id) ?? null;
          return (
            <RatingElement
              key={element.id}
              element={element}
              dataType={key === null ? null : dataTypeByKey(key).rmType}
              rule={round.rule}
              editable={editable}
              save={async (score, reason) => {
                const result = await saveRating({
                  data: { projectId, roundId, elementId: element.id, score, reason },
                });
                if (result.ok) {
                  const trimmed = reason.trim();
                  remember(element.id, {
                    rated: true,
                    score,
                    reason: trimmed === "" ? null : trimmed,
                  });
                }
                return result.ok ? { ok: true } : result;
              }}
              clear={async () => {
                const result = await clearRating({
                  data: { projectId, roundId, elementId: element.id },
                });
                if (result.ok) remember(element.id, { rated: false, score: null, reason: null });
                return result.ok ? { ok: true } : result;
              }}
            />
          );
        })}
      </div>
      <p className="text-sm text-muted-foreground">
        {m.rounds_rate_autosave()}{" "}
        <Link
          to="/projects/$projectId/rounds"
          params={{ projectId }}
          className="underline underline-offset-4"
        >
          {m.rounds_back_to_rounds()}
        </Link>
      </p>
    </div>
  );
}
