// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { CircleAlertIcon } from "lucide-react";
import { z } from "zod";
import { PublicLayout } from "@/components/shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";
import { refusalMessage } from "@/lib/i18n/refusals";
import { verifyPath } from "@/lib/sign-in";

// The page the sign-in e-mail links to. Opening it reads nothing and uses no token: a mail
// scanner or link preview that opens it leaves the link usable. The button opens the verification.
// The page names no account (owner decision 2026-11-25, PR1).
export const Route = createFileRoute("/sign-in_/confirm")({
  validateSearch: z.object({
    token: z.string().max(200).optional(),
    callbackURL: z.string().max(500).optional(),
    newUserCallbackURL: z.string().max(500).optional(),
    errorCallbackURL: z.string().max(500).optional(),
  }),
  head: () => ({ meta: [{ title: `${m.sign_in_title()} | ${m.app_name()}` }] }),
  component: Confirm,
});

function Confirm() {
  const search = Route.useSearch();
  return (
    <PublicLayout>
      <h1 className="text-2xl font-semibold">{m.sign_in_title()}</h1>
      {search.token === undefined || search.token === "" ? (
        <Alert variant="destructive" className="mt-4" role="alert">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{refusalMessage("invalid_link")}</AlertDescription>
        </Alert>
      ) : (
        <>
          <p className="mt-2 text-muted-foreground">{m.sign_in_confirm_intro()}</p>
          <Button className="mt-6" onClick={() => window.location.assign(verifyPath(search))}>
            {m.sign_in_confirm_button()}
          </Button>
        </>
      )}
    </PublicLayout>
  );
}
