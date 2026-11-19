// SPDX-FileCopyrightText: Sophie de Klerk
// SPDX-License-Identifier: Apache-2.0

import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/shell/route-states";
import { m } from "@/i18n/messages";
import { requireAppRole } from "@/lib/guards";

/** Administration (AD1, AD2), for administrators only. */
export const Route = createFileRoute("/_authed/admin")({
  beforeLoad: requireAppRole("administrator"),
  head: () => ({ meta: [{ title: `${m.admin_title()} | ${m.app_name()}` }] }),
  component: Admin,
});

function Admin() {
  return <PageHeader title={m.admin_title()} description={m.admin_purpose()} />;
}
