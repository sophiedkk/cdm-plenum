// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { z } from "zod";
import { AccountsTable } from "@/components/admin/accounts-table";
import { ActivityFilter, ActivityTable } from "@/components/admin/activity-log";
import { AppRightsTable, GrantRightForm, rightLabel } from "@/components/admin/app-rights";
import { NotFoundState, PageHeader } from "@/components/shell/route-states";
import { Separator } from "@/components/ui/separator";
import { m } from "@/i18n/messages";
import { requireAppRole } from "@/lib/guards";
import {
  deactivateAccountFn,
  grantRoleFn,
  reactivateAccountFn,
  revokeRoleFn,
} from "@/server/admin/functions";
import {
  accountsQueryOptions,
  activityQueryOptions,
  adminKeys,
  appRolesQueryOptions,
} from "@/server/admin/query-options";
import { ACTIVITY_LIMIT, activityInput } from "@/server/admin/schemas";
import { sessionKeys } from "@/server/session/query-options";

const searchSchema = z.object({ action: activityInput.shape.action.catch(undefined) });

/** Administration (AD1, AD2), for administrators only; the server functions check again. */
export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: requireAppRole("administrator"),
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ action: search.action }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(appRolesQueryOptions()),
      context.queryClient.ensureQueryData(accountsQueryOptions()),
      context.queryClient.ensureQueryData(activityQueryOptions(deps.action)),
    ]),
  head: () => ({ meta: [{ title: `${m.admin_title()} | ${m.app_name()}` }] }),
  component: Admin,
});

function Admin() {
  const { user } = Route.useRouteContext();
  const { action } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const queryClient = useQueryClient();
  const { data: rights } = useSuspenseQuery(appRolesQueryOptions());
  const { data: accounts } = useSuspenseQuery(accountsQueryOptions());
  const { data: activity } = useSuspenseQuery(activityQueryOptions(action));
  const grant = useServerFn(grantRoleFn);
  const revoke = useServerFn(revokeRoleFn);
  const deactivate = useServerFn(deactivateAccountFn);
  const reactivate = useServerFn(reactivateAccountFn);
  if (!rights.ok || !accounts.ok || !activity.ok) return <NotFoundState />;

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: adminKeys.all }),
      // The shell shows the administration link from the session's own rights.
      queryClient.invalidateQueries({ queryKey: sessionKeys.all }),
    ]);
  };

  return (
    <>
      <PageHeader title={m.admin_title()} description={m.admin_purpose()} />
      <div className="flex flex-col gap-10">
        <section aria-labelledby="rights-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="rights-title" className="text-xl font-semibold">
              {m.admin_rights_title()}
            </h2>
            <p className="text-muted-foreground">{m.admin_rights_description()}</p>
          </div>
          <AppRightsTable
            holders={rights.value}
            revoke={(input) => revoke({ data: input })}
            onRevoked={refresh}
          />
          <GrantRightForm
            grant={(input) => grant({ data: input })}
            onGranted={async (email, role) => {
              toast.success(m.admin_right_granted({ email, right: rightLabel(role) }));
              await refresh();
            }}
          />
        </section>
        <Separator />
        <section aria-labelledby="accounts-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="accounts-title" className="text-xl font-semibold">
              {m.admin_accounts_title()}
            </h2>
            <p className="text-muted-foreground">{m.admin_accounts_description()}</p>
          </div>
          <AccountsTable
            accounts={accounts.value}
            currentUserId={user.id}
            deactivate={(userId) => deactivate({ data: { userId } })}
            reactivate={(userId) => reactivate({ data: { userId } })}
            onChanged={refresh}
          />
        </section>
        <Separator />
        <section aria-labelledby="activity-title" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="activity-title" className="text-xl font-semibold">
              {m.admin_activity_title()}
            </h2>
            <p className="text-muted-foreground">
              {m.admin_activity_description({ limit: ACTIVITY_LIMIT })}
            </p>
          </div>
          <ActivityFilter
            actions={activity.value.actions}
            value={action}
            onChange={(next) => void navigate({ search: { action: next }, replace: true })}
          />
          <ActivityTable entries={activity.value.entries} />
        </section>
      </div>
    </>
  );
}
