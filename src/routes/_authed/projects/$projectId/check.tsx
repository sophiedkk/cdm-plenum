// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQuery, useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ListChecksIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { GroupCheckList, remarkCount } from "@/components/board/group-check";
import { projectTitle } from "@/components/projects/project-title";
import { EmptyState, NotFoundState, PageHeader } from "@/components/shell/route-states";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { requireStep } from "@/lib/guards";
import { refusalMessage } from "@/lib/i18n/refusals";
import {
  addGroupMissingFn,
  addSameAsFn,
  finishGroupCheckFn,
  setElsewhereFn,
} from "@/server/elements/functions";
import {
  elementKeys,
  groupCheckQueryOptions,
  ownMarksQueryOptions,
} from "@/server/elements/query-options";
import { projectKeys } from "@/server/projects/query-options";

/**
 * Check the groups (EL24, ADR 0020): a participant marks an element "Same as…" or "Belongs
 * elsewhere" and says per group what is missing. The remarks are their own; the facilitator reads
 * them without names (EL2).
 */
export const Route = createFileRoute("/_authed/projects/$projectId/check")({
  beforeLoad: requireStep("group_check"),
  loader: async ({ context, params }) => {
    await context.queryClient.prefetchQuery(groupCheckQueryOptions(params.projectId));
  },
  head: ({ match }) => ({
    meta: [{ title: projectTitle(match.context, m.board_check_title()) }],
  }),
  component: CheckGroups,
});

function CheckGroups() {
  const { projectId } = Route.useParams();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: check } = useSuspenseQuery(groupCheckQueryOptions(projectId));
  const { data: marks } = useQuery(ownMarksQueryOptions(projectId));
  const setElsewhere = useServerFn(setElsewhereFn);
  const addSameAs = useServerFn(addSameAsFn);
  const addMissing = useServerFn(addGroupMissingFn);
  const finish = useServerFn(finishGroupCheckFn);
  const [pending, setPending] = useState(false);

  if (!check.ok) {
    if (check.error === "group_check_not_asked") {
      return (
        <>
          <PageHeader level={2} title={m.board_check_title()} />
          <EmptyState
            icon={<ListChecksIcon aria-hidden="true" />}
            title={m.board_check_not_asked_title()}
            description={m.board_check_not_asked()}
          />
        </>
      );
    }
    if (check.error === "not_found") throw notFound();
    return <NotFoundState />;
  }
  const sameAs = marks?.ok ? marks.value.sameAs : [];
  const count = remarkCount(check.value, sameAs);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: elementKeys.groups(projectId) }),
      queryClient.invalidateQueries({ queryKey: elementKeys.marks(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectKeys.overview(projectId) }),
    ]);
  };

  return (
    <>
      <PageHeader
        level={2}
        title={m.board_check_title()}
        description={m.board_check_purpose()}
        actions={
          <span aria-live="polite" className="text-sm text-muted-foreground">
            {count === 0
              ? m.board_check_remarks_none()
              : count === 1
                ? m.board_check_remarks_one()
                : m.board_check_remarks_many({ count })}
          </span>
        }
      />
      {check.value.done && (
        <p className="mb-4 text-sm text-muted-foreground">{m.board_check_already_done()}</p>
      )}
      <GroupCheckList
        check={check.value}
        sameAs={sameAs}
        actions={{
          setElsewhere: (elementId, elsewhere) =>
            setElsewhere({ data: { projectId, elementId, elsewhere } }),
          addSameAs: (elementId, sameAsId) =>
            addSameAs({ data: { projectId, elementId, sameAsId } }),
          addMissing: (groupId, body) => addMissing({ data: { projectId, groupId, body } }),
          onChanged: refresh,
        }}
      />
      {!check.value.done && (
        <div className="mt-8">
          <Button
            type="button"
            size="lg"
            disabled={pending}
            aria-busy={pending}
            onClick={async () => {
              setPending(true);
              try {
                const outcome = await finish({ data: { projectId } });
                if (!outcome.ok) {
                  toast.error(refusalMessage(outcome.error));
                  return;
                }
                toast.success(m.board_check_finished());
                await refresh();
                await navigate({ to: "/projects/$projectId", params: { projectId } });
              } catch {
                toast.error(m.common_error_unexpected());
              } finally {
                setPending(false);
              }
            }}
          >
            {m.board_check_done()}
          </Button>
        </div>
      )}
    </>
  );
}
