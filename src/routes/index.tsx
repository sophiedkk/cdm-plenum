// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { m } from "@/i18n/messages";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold tracking-tight">{m.app_name()}</h1>
      <p className="mt-2 text-neutral-700">{m.app_description()}</p>
    </main>
  );
}
