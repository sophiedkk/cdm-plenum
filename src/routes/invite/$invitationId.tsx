// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Link } from "@tanstack/react-router";
import { m } from "@/i18n/messages";
import { invitationPreviewFn } from "@/server/invitations/functions";
import { idSchema } from "@/server/projects/schemas";

/** The invitation link (PR3): the project name while the invitation is pending, then sign-in. */
export const Route = createFileRoute("/invite/$invitationId")({
  loader: async ({ params }) => {
    if (!idSchema.safeParse(params.invitationId).success) return null;
    return invitationPreviewFn({ data: { invitationId: params.invitationId } });
  },
  head: () => ({ meta: [{ title: `${m.invite_title()} | ${m.app_name()}` }] }),
  component: Invitation,
});

function Invitation() {
  const preview = Route.useLoaderData();
  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-semibold">{m.invite_title()}</h1>
      {preview ? (
        <>
          <p className="mt-4">{m.invite_pending({ project: preview.projectName })}</p>
          <p className="mt-2 text-neutral-700">{m.invite_next()}</p>
          <Link
            to="/sign-in"
            className="mt-6 inline-block rounded bg-neutral-900 px-4 py-2 font-medium text-white"
          >
            {m.invite_sign_in()}
          </Link>
        </>
      ) : (
        <p className="mt-4" role="alert">
          {m.invite_invalid()}
        </p>
      )}
    </main>
  );
}
