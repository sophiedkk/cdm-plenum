// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { CircleAlertIcon } from "lucide-react";
import { type FormEvent, useId, useState } from "react";
import { z } from "zod";
import { PublicLayout } from "@/components/shell/app-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { m } from "@/i18n/messages";
import { authClient } from "@/lib/auth-client";
import { refusalMessage } from "@/lib/i18n/refusals";
import { SIGN_IN_LINK_MINUTES, signInError } from "@/lib/sign-in";

export const Route = createFileRoute("/sign-in")({
  validateSearch: z.object({ error: z.string().max(100).optional() }),
  head: () => ({ meta: [{ title: `${m.sign_in_title()} | ${m.app_name()}` }] }),
  component: SignIn,
});

type State =
  | { kind: "form" }
  | { kind: "sending" }
  | { kind: "sent"; email: string }
  | { kind: "failed" };

function ErrorAlert({ children }: Readonly<{ children: string }>) {
  return (
    <Alert variant="destructive" className="mt-4" role="alert">
      <CircleAlertIcon aria-hidden="true" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

function SignIn() {
  const { error } = Route.useSearch();
  const [state, setState] = useState<State>({ kind: "form" });
  const emailId = useId();
  const linkError = signInError(error);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    setState({ kind: "sending" });
    const result = await authClient.signIn.magicLink({
      email,
      callbackURL: "/",
      errorCallbackURL: "/sign-in",
    });
    setState(result.error ? { kind: "failed" } : { kind: "sent", email });
  }

  if (state.kind === "sent") {
    return (
      <PublicLayout>
        <h1 className="text-2xl font-semibold">{m.sign_in_check_inbox_title()}</h1>
        <p className="mt-4" role="status">
          {m.sign_in_check_inbox({ email: state.email, minutes: SIGN_IN_LINK_MINUTES })}
        </p>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <h1 className="text-2xl font-semibold">{m.sign_in_title()}</h1>
      <p className="mt-2 text-muted-foreground">{m.sign_in_intro()}</p>
      {linkError && <ErrorAlert>{refusalMessage(linkError)}</ErrorAlert>}
      {state.kind === "failed" && <ErrorAlert>{m.sign_in_error_failed()}</ErrorAlert>}
      <form className="mt-6 flex flex-col gap-3" onSubmit={(event) => void submit(event)}>
        <Label htmlFor={emailId}>{m.sign_in_email_label()}</Label>
        <Input id={emailId} name="email" type="email" autoComplete="email" required />
        <Button type="submit" disabled={state.kind === "sending"}>
          {state.kind === "sending" ? m.sign_in_sending() : m.sign_in_submit()}
        </Button>
      </form>
    </PublicLayout>
  );
}
