// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { PublicLayout } from "@/components/shell/app-shell";
import { Button } from "@/components/ui/button";
import { m } from "@/i18n/messages";

export const Route = createFileRoute("/")({
  beforeLoad: ({ context }) => {
    if (context.user) throw redirect({ to: "/projects" });
  },
  component: Home,
});

function Home() {
  return (
    <PublicLayout>
      <h1 className="type-home-card">{m.app_name()}</h1>
      <p className="mt-2 text-muted-foreground">{m.app_description()}</p>
      <Button asChild className="mt-6">
        <Link to="/sign-in">{m.shell_sign_in()}</Link>
      </Button>
    </PublicLayout>
  );
}
