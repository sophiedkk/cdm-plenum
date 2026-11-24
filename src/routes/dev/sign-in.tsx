// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { AppShell, PublicLayout } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { refusalMessage } from "@/lib/i18n/refusals";
import type { AppRole } from "@/server/admin/app-roles";
import { devSignInFn } from "@/server/dev-sign-in/functions";
import type { DevSignInGroup } from "@/server/dev-sign-in/queries";
import { devSignInPeopleQueryOptions } from "@/server/dev-sign-in/query-options";

/**
 * The development sign-in page (DEV_SIGN_IN, docs/testing.md): one button per active account.
 * With the setting off the server refuses and the page does not exist.
 */
export const Route = createFileRoute("/dev/sign-in")({
  loader: async ({ context }) => {
    const people = await context.queryClient.ensureQueryData(devSignInPeopleQueryOptions());
    if (!people.ok) throw notFound();
  },
  head: () => ({ meta: [{ title: `${m.shell_dev_sign_in_title()} | ${m.app_name()}` }] }),
  component: DevSignIn,
});

const ROLE_HEADINGS: Record<AppRole, () => string> = {
  administrator: () => m.shell_dev_sign_in_administrators(),
  facilitator: () => m.shell_dev_sign_in_facilitators(),
};

function heading(group: DevSignInGroup): string {
  if (group.kind === "role") return ROLE_HEADINGS[group.role]();
  if (group.kind === "group") return group.name;
  return m.shell_dev_sign_in_no_group();
}

function Frame({ children }: Readonly<{ children: ReactNode }>) {
  const { user } = Route.useRouteContext();
  return user ? (
    <AppShell user={user}>{children}</AppShell>
  ) : (
    <PublicLayout>{children}</PublicLayout>
  );
}

function DevSignIn() {
  const { data } = useSuspenseQuery(devSignInPeopleQueryOptions());
  const signInAs = useServerFn(devSignInFn);
  const [pending, setPending] = useState(false);
  const groups = data.ok ? data.value : [];

  async function choose(userId: string) {
    setPending(true);
    const result = await signInAs({ data: { userId } });
    if (!result.ok) {
      setPending(false);
      toast.error(refusalMessage(result.error));
      return;
    }
    // A full page load opens the sign-in link, so no cached data of the previous person stays.
    window.location.assign(result.value);
  }

  return (
    <Frame>
      <h1 className="text-2xl font-semibold tracking-tight">{m.shell_dev_sign_in_title()}</h1>
      <p className="mt-2 mb-6">{m.shell_dev_sign_in_note()}</p>
      {groups.length === 0 ? (
        <p className="text-muted-foreground">{m.shell_dev_sign_in_empty()}</p>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group) => (
            <section key={`${group.kind}:${heading(group)}`} className="flex flex-col gap-2">
              <h2 className="text-lg font-semibold">{heading(group)}</h2>
              <ul className="flex flex-col gap-2">
                {group.people.map((person) => (
                  <li key={person.id}>
                    <Button
                      variant="outline"
                      className="h-auto w-full flex-col items-start gap-0 py-2 text-left"
                      disabled={pending}
                      onClick={() => void choose(person.id)}
                    >
                      <span className="font-semibold">{person.name || person.email}</span>
                      {person.name && (
                        <span className="text-sm font-normal text-muted-foreground">
                          {person.email}
                        </span>
                      )}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Frame>
  );
}
